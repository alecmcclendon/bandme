from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import sqlite3
import os
from datetime import datetime
from werkzeug.utils import secure_filename

# ✅ NEW: ensure correct MIME types for videos
import mimetypes

mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/quicktime", ".mov")

# ✅ R2 / S3 client (install: pip install boto3)
import boto3
from botocore.config import Config

app = Flask(__name__)
app.secret_key = "change-me-in-prod"
DB_NAME = "users.db"

# ---- Local Upload settings (kept as fallback if R2 is not configured) ----
UPLOAD_FOLDER = os.path.join("static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Posts can be images + videos
POST_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "mp4", "mov"}

# Avatars should be images only
AVATAR_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

# =========================================================
# R2 CONFIG (Python-only integration, no template changes)
#
# You store paths like: /r2/<key>
# The /r2/<key> route redirects to a signed URL.
#
# Env vars required:
#   R2_ENDPOINT_URL="https://<account_id>.r2.cloudflarestorage.com"
#   R2_ACCESS_KEY_ID="..."
#   R2_SECRET_ACCESS_KEY="..."
#   R2_BUCKET="your-bucket"
# Optional:
#   R2_SIGNED_URL_EXPIRES="3600"
# =========================================================
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_SIGNED_URL_EXPIRES = int(os.getenv("R2_SIGNED_URL_EXPIRES", "3600"))

_s3 = None
if all([R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET]):
    _s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def r2_enabled() -> bool:
    return _s3 is not None


def r2_make_key(prefix: str, filename: str) -> str:
    # Example: posts/post_u1_...jpg
    return f"{prefix.strip('/')}/{filename}"


def r2_path_for_key(key: str) -> str:
    # What you store in DB so templates can use it directly
    return f"/r2/{key.lstrip('/')}"


def r2_key_from_db_path(path: str | None) -> str | None:
    if not path:
        return None
    if path.startswith("/r2/"):
        return path[len("/r2/") :]
    return None


def r2_upload(file_storage, key: str) -> None:
    if not r2_enabled():
        raise RuntimeError("R2 not configured (missing env vars).")

    content_type = mimetypes.guess_type(file_storage.filename)[0] or "application/octet-stream"
    _s3.upload_fileobj(
        file_storage.stream,
        R2_BUCKET,
        key,
        ExtraArgs={"ContentType": content_type},
    )


def r2_delete_key(key: str) -> None:
    if not r2_enabled() or not key:
        return
    try:
        _s3.delete_object(Bucket=R2_BUCKET, Key=key)
    except Exception:
        # Avoid crashing requests on delete errors
        pass


def r2_signed_get_url(key: str, expires_seconds: int = R2_SIGNED_URL_EXPIRES) -> str:
    if not r2_enabled():
        raise RuntimeError("R2 not configured (missing env vars).")
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": R2_BUCKET, "Key": key},
        ExpiresIn=expires_seconds,
    )


# ✅ Signed URL redirect route (templates can use /r2/<key> as src/href)
@app.route("/r2/<path:key>")
def r2_proxy(key):
    if not r2_enabled():
        return "R2 not configured", 500
    url = r2_signed_get_url(key)
    return redirect(url)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in POST_EXTENSIONS


def allowed_avatar(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in AVATAR_EXTENSIONS


def default_avatar_for(role: str) -> str:
    return "/static/img/profile_icon_band.png" if role == "band" else "/static/img/profile_icon.png"


def _unique_upload_name(prefix: str, user_id: int, original_filename: str) -> str:
    filename = secure_filename(original_filename)
    _, ext = os.path.splitext(filename)
    ts = int(datetime.utcnow().timestamp())
    rand = os.urandom(4).hex()
    return f"{prefix}_u{user_id}_{ts}_{rand}{ext.lower()}"


# ---- Make header always reflect latest DB (custom avatar OR role default) ----
@app.context_processor
def inject_header_user():
    me = session.get("user_id")
    if not me:
        return {}

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT username, role, avatar_path FROM users WHERE id = ?", (me,))
    u = c.fetchone()
    conn.close()

    if not u:
        return {}

    header_avatar = u["avatar_path"] or default_avatar_for(u["role"])
    return {
        "header_username": u["username"],
        "header_avatar": header_avatar,
        "header_role": u["role"],
    }


# ---- DB init helpers ----
def _ensure_user_columns(conn):
    c = conn.cursor()
    c.execute("PRAGMA table_info(users)")
    cols = {row[1] for row in c.fetchall()}

    if "bio" not in cols:
        c.execute("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''")
    if "avatar_path" not in cols:
        c.execute("ALTER TABLE users ADD COLUMN avatar_path TEXT")


def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()

    # users table
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'individual',
            bio TEXT NOT NULL DEFAULT '',
            avatar_path TEXT
        )
    """)

    # posts table (feed posts)
    c.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            caption TEXT,
            genre TEXT,
            my_instrument TEXT,
            target_instrument TEXT,
            tags TEXT,
            media_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # showcase items table (separate from posts)
    c.execute("""
        CREATE TABLE IF NOT EXISTS showcase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            media_path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # follows table (follower -> following)
    c.execute("""
        CREATE TABLE IF NOT EXISTS follows (
            follower_id  INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower_id, following_id),
            FOREIGN KEY (follower_id)  REFERENCES users(id),
            FOREIGN KEY (following_id) REFERENCES users(id)
        )
    """)

    # conversations table
    c.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1_id INTEGER NOT NULL,
            user2_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user1_id, user2_id),
            FOREIGN KEY (user1_id) REFERENCES users(id),
            FOREIGN KEY (user2_id) REFERENCES users(id)
        )
    """)

    # messages table
    c.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id),
            FOREIGN KEY (sender_id) REFERENCES users(id)
        )
    """)

    # conversation read-state
    c.execute("""
        CREATE TABLE IF NOT EXISTS conversation_reads (
            conversation_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            last_read_at TIMESTAMP,
            PRIMARY KEY (conversation_id, user_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id),
            FOREIGN KEY (user_id)        REFERENCES users(id)
        )
    """)

    # per-user conversation state (hide/clear for ME only)
    c.execute("""
        CREATE TABLE IF NOT EXISTS conversation_states (
            conversation_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            hidden INTEGER NOT NULL DEFAULT 0,
            cleared_at TIMESTAMP,
            PRIMARY KEY (conversation_id, user_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id),
            FOREIGN KEY (user_id)        REFERENCES users(id)
        )
    """)

    _ensure_user_columns(conn)
    conn.commit()
    conn.close()


def get_showcase_items(conn, user_id: int, limit: int = 12):
    c = conn.cursor()
    c.execute("""
        SELECT id, media_path, created_at
        FROM showcase_items
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    """, (user_id, limit))
    return c.fetchall()


# ---- Helper for sorted user-pair ----
def _sorted_pair(a: int, b: int):
    return (a, b) if a < b else (b, a)


# ensure per-user state row exists
def ensure_conv_state(conn, conversation_id: int, user_id: int):
    c = conn.cursor()
    c.execute("""
        INSERT OR IGNORE INTO conversation_states (conversation_id, user_id, hidden, cleared_at)
        VALUES (?, ?, 0, NULL)
    """, (conversation_id, user_id))


# ---- Routes ----
@app.route("/")
def index():
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username=? AND password=?", (username, password))
        user = c.fetchone()
        conn.close()

        if user:
            session["user_id"] = user[0]
            session["username"] = user[1]
            session["role"] = user[3]
            return redirect(url_for("home"))
        else:
            error = "ユーザー名またはパスワードが正しくありません"

    return render_template("index.html", error=error)


@app.route("/register", methods=["GET", "POST"])
def register():
    message = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        role = request.form.get("role", "individual")

        try:
            conn = sqlite3.connect(DB_NAME)
            c = conn.cursor()
            c.execute(
                "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                (username, password, role),
            )
            conn.commit()
            conn.close()
            message = "アカウントを登録しました"
        except sqlite3.IntegrityError:
            message = "そのユーザー名はすでに使われています"

    return render_template("register.html", message=message)


@app.route("/success")
def success():
    return redirect(url_for("home"))


@app.route("/home")
def home():
    if "username" not in session:
        return redirect(url_for("login"))

    filter_role = request.args.get("role")
    filter_genre = request.args.get("genre_filter")
    filter_instrument = request.args.get("instrument_filter")
    filter_my_instrument = request.args.get("my_instrument_filter")
    filter_tags_str = request.args.get("tags", "").strip()
    filter_q = request.args.get("q", "").strip()

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    where_clauses = []
    params = []

    if filter_role in ("individual", "band"):
        where_clauses.append("u.role = ?")
        params.append(filter_role)

    if filter_genre:
        where_clauses.append("p.genre = ?")
        params.append(filter_genre)

    if filter_instrument:
        where_clauses.append("p.target_instrument = ?")
        params.append(filter_instrument)

    if filter_my_instrument:
        where_clauses.append("p.my_instrument = ?")
        params.append(filter_my_instrument)

    if filter_tags_str:
        tag_list = [t.strip() for t in filter_tags_str.split(",") if t.strip()]
        if tag_list:
            tag_conditions = []
            for t in tag_list:
                tag_conditions.append("p.tags LIKE ?")
                params.append(f"%{t}%")
            where_clauses.append("(" + " OR ".join(tag_conditions) + ")")

    if filter_q:
        where_clauses.append("(p.caption LIKE ? OR p.tags LIKE ? OR u.username LIKE ?)")
        like = f"%{filter_q}%"
        params.extend([like, like, like])

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    query = f"""
        SELECT p.*, u.username, u.role, u.avatar_path
        FROM posts p
        JOIN users u ON p.user_id = u.id
        {where_sql}
        ORDER BY p.created_at DESC
    """
    c.execute(query, params)
    posts = c.fetchall()
    conn.close()

    return render_template(
        "home.html",
        username=session.get("username"),
        role=session.get("role", "individual"),
        posts=posts,
        filter_role=filter_role,
        filter_genre=filter_genre,
        filter_instrument=filter_instrument,
        filter_my_instrument=filter_my_instrument,
        filter_tags_str=filter_tags_str,
        filter_q=filter_q,
    )


@app.route("/profile")
def profile():
    if "user_id" not in session:
        return redirect(url_for("login"))

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT id, username, role, bio, avatar_path FROM users WHERE id = ?", (me,))
    user = c.fetchone()
    if not user:
        conn.close()
        return redirect(url_for("logout"))

    avatar = user["avatar_path"] or default_avatar_for(user["role"])

    c.execute("SELECT COUNT(*) AS cnt FROM follows WHERE following_id = ?", (me,))
    follower_count = c.fetchone()["cnt"]

    c.execute("SELECT COUNT(*) AS cnt FROM follows WHERE follower_id = ?", (me,))
    following_count = c.fetchone()["cnt"]

    showcase_items = get_showcase_items(conn, me)
    conn.close()

    return render_template(
        "profile.html",
        user=user,
        avatar=avatar,
        username=user["username"],
        role=user["role"],
        bio=user["bio"],
        follower_count=follower_count,
        following_count=following_count,
        page_user_id=me,
        showcase_items=showcase_items,
    )


@app.route("/profile/update", methods=["POST"])
def update_profile():
    if "user_id" not in session:
        return redirect(url_for("login"))

    me = session["user_id"]
    new_username = (request.form.get("username") or "").strip()
    new_bio = (request.form.get("bio") or "").strip()

    if not new_username:
        return "username is required", 400

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT username, role, avatar_path FROM users WHERE id = ?", (me,))
    me_row = c.fetchone()
    if not me_row:
        conn.close()
        return "User not found", 404

    if new_username != me_row["username"]:
        c.execute("SELECT 1 FROM users WHERE username = ? AND id != ?", (new_username, me))
        if c.fetchone():
            conn.close()
            return "そのユーザー名はすでに使われています", 400

    avatar_path = me_row["avatar_path"]
    old_avatar_key = r2_key_from_db_path(avatar_path)

    file = request.files.get("icon")
    if file and file.filename:
        if not allowed_avatar(file.filename):
            conn.close()
            return "Invalid avatar file type", 400

        unique = _unique_upload_name("avatar", me, file.filename)

        if r2_enabled():
            new_key = r2_make_key("avatars", unique)
            r2_upload(file, new_key)
            avatar_path = r2_path_for_key(new_key)

            # optional cleanup: delete prior avatar object (only if it was stored in R2)
            if old_avatar_key and old_avatar_key.startswith("avatars/"):
                r2_delete_key(old_avatar_key)
        else:
            # fallback to local storage
            save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique)
            file.save(save_path)
            avatar_path = "/" + save_path.replace(os.sep, "/")

    c.execute("""
        UPDATE users
        SET username = ?, bio = ?, avatar_path = ?
        WHERE id = ?
    """, (new_username, new_bio, avatar_path, me))

    conn.commit()
    conn.close()

    session["username"] = new_username
    return redirect(url_for("profile"))


@app.route("/showcase/update", methods=["POST"])
def update_showcase():
    if "user_id" not in session:
        return redirect(url_for("login"))

    me = session["user_id"]
    delete_ids = request.form.getlist("delete_ids")
    files = request.files.getlist("files[]")

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # delete only my items (and delete R2 object if applicable)
    for raw in delete_ids:
        try:
            sid = int(raw)
        except ValueError:
            continue

        c.execute("SELECT media_path FROM showcase_items WHERE id = ? AND user_id = ?", (sid, me))
        row = c.fetchone()
        if row:
            key = r2_key_from_db_path(row["media_path"])
            if key:
                r2_delete_key(key)

        c.execute("DELETE FROM showcase_items WHERE id = ? AND user_id = ?", (sid, me))

    # add uploads
    for f in files:
        if not f or not f.filename:
            continue
        if not allowed_file(f.filename):
            continue

        unique = _unique_upload_name("showcase", me, f.filename)

        if r2_enabled():
            key = r2_make_key("showcase", unique)
            r2_upload(f, key)
            media_path = r2_path_for_key(key)
        else:
            save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique)
            f.save(save_path)
            media_path = "/" + save_path.replace(os.sep, "/")

        c.execute(
            "INSERT INTO showcase_items (user_id, media_path) VALUES (?, ?)",
            (me, media_path),
        )

    conn.commit()
    conn.close()
    return redirect(url_for("profile"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/create_post", methods=["POST"])
def create_post():
    if "user_id" not in session:
        return redirect(url_for("login"))

    me = session["user_id"]

    post_id_raw = (request.form.get("post_id") or "").strip()
    post_id = None
    if post_id_raw:
        try:
            post_id = int(post_id_raw)
        except ValueError:
            post_id = None

    caption = request.form.get("caption", "").strip()
    genre = request.form.get("genre_filter", "")
    my_instrument = request.form.get("my_instrument_filter", "")
    target_instrument = request.form.get("instrument_filter", "")
    tags = request.form.get("tags", "").strip()

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # ---------- EDIT MODE ----------
    if post_id is not None:
        c.execute("SELECT user_id, media_path FROM posts WHERE id = ?", (post_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return "Post not found", 404
        if row["user_id"] != me:
            conn.close()
            return "Forbidden", 403

        media_path = row["media_path"]
        old_key = r2_key_from_db_path(media_path)

        # if user clicked the X, remove existing media
        remove_media = (request.form.get("remove_media") or "0") == "1"
        if remove_media:
            if old_key:
                r2_delete_key(old_key)
            elif media_path and media_path.startswith("/static/uploads/"):
                try:
                    os.remove(media_path.lstrip("/"))
                except OSError:
                    pass
            media_path = None

        # If user uploads a new file, it overrides removal
        file = request.files.get("media")
        if file and file.filename and allowed_file(file.filename):
            unique = _unique_upload_name("post", me, file.filename)

            if r2_enabled():
                new_key = r2_make_key("posts", unique)
                r2_upload(file, new_key)
                media_path = r2_path_for_key(new_key)

                # optional cleanup: delete prior object if replacing
                if old_key:
                    r2_delete_key(old_key)
            else:
                save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique)
                file.save(save_path)
                media_path = "/" + save_path.replace(os.sep, "/")

        c.execute("""
            UPDATE posts
            SET caption=?, genre=?, my_instrument=?, target_instrument=?, tags=?, media_path=?
            WHERE id=?
        """, (caption, genre, my_instrument, target_instrument, tags, media_path, post_id))

        conn.commit()
        conn.close()
        return redirect(url_for("home"))

    # ---------- CREATE MODE ----------
    media_path = None
    file = request.files.get("media")
    if file and file.filename and allowed_file(file.filename):
        unique = _unique_upload_name("post", me, file.filename)

        if r2_enabled():
            key = r2_make_key("posts", unique)
            r2_upload(file, key)
            media_path = r2_path_for_key(key)
        else:
            save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique)
            file.save(save_path)
            media_path = "/" + save_path.replace(os.sep, "/")

    c.execute("""
        INSERT INTO posts (user_id, caption, genre, my_instrument, target_instrument, tags, media_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (me, caption, genre, my_instrument, target_instrument, tags, media_path))

    conn.commit()
    conn.close()
    return redirect(url_for("home"))


@app.route("/posts/<int:post_id>/delete", methods=["POST"])
def delete_post(post_id):
    if "user_id" not in session:
        return redirect(url_for("login"))

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT user_id, media_path FROM posts WHERE id = ?", (post_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return "Post not found", 404
    if row["user_id"] != me:
        conn.close()
        return "Forbidden", 403

    # optional: delete underlying media
    key = r2_key_from_db_path(row["media_path"])
    if key:
        r2_delete_key(key)
    elif row["media_path"] and row["media_path"].startswith("/static/uploads/"):
        try:
            os.remove(row["media_path"].lstrip("/"))
        except OSError:
            pass

    c.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()
    return redirect(url_for("home"))


# ======================= FOLLOW API =======================

@app.route("/api/follow/toggle", methods=["POST"])
def api_follow_toggle():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    me = session["user_id"]
    data = request.get_json(force=True) or {}

    target = data.get("other_user_id", data.get("user_id"))

    try:
        target = int(target)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid target id"}), 400

    if target == me:
        return jsonify({"error": "cannot follow yourself"}), 400

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT id FROM users WHERE id = ?", (target,))
    if not c.fetchone():
        conn.close()
        return jsonify({"error": "user not found"}), 404

    c.execute("""
        SELECT 1 FROM follows
        WHERE follower_id = ? AND following_id = ?
    """, (me, target))
    exists = c.fetchone() is not None

    if exists:
        c.execute("""
            DELETE FROM follows
            WHERE follower_id = ? AND following_id = ?
        """, (me, target))
        is_following = False
    else:
        c.execute("""
            INSERT OR IGNORE INTO follows (follower_id, following_id)
            VALUES (?, ?)
        """, (me, target))
        is_following = True

    c.execute("SELECT COUNT(*) AS cnt FROM follows WHERE following_id = ?", (target,))
    follower_count = c.fetchone()["cnt"]

    conn.commit()
    conn.close()

    return jsonify({
        "is_following": is_following,
        "follower_count": follower_count,
    })


@app.route("/api/users/<int:user_id>/followers", methods=["GET"])
def api_followers(user_id):
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT u.id, u.username, u.role, u.avatar_path
        FROM follows f
        JOIN users u ON u.id = f.follower_id
        WHERE f.following_id = ?
        ORDER BY u.username ASC
    """, (user_id,))
    rows = c.fetchall()
    conn.close()

    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "username": r["username"],
            "role": r["role"],
            "avatar": r["avatar_path"] or default_avatar_for(r["role"]),
        })
    return jsonify(out)


@app.route("/api/users/<int:user_id>/following", methods=["GET"])
def api_following(user_id):
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT u.id, u.username, u.role, u.avatar_path
        FROM follows f
        JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = ?
        ORDER BY u.username ASC
    """, (user_id,))
    rows = c.fetchall()
    conn.close()

    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "username": r["username"],
            "role": r["role"],
            "avatar": r["avatar_path"] or default_avatar_for(r["role"]),
        })
    return jsonify(out)


# ======================= MESSAGING API =======================

@app.route("/api/conversations", methods=["GET"])
def api_conversations():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT
          c.id AS conversation_id,
          c.user1_id,
          c.user2_id,
          u1.username AS user1_name,
          u1.role     AS user1_role,
          u1.avatar_path AS user1_avatar,
          u2.username AS user2_name,
          u2.role     AS user2_role,
          u2.avatar_path AS user2_avatar,
          (
            SELECT body FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT created_at FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) AS last_created_at
        FROM conversations c
        JOIN users u1 ON u1.id = c.user1_id
        JOIN users u2 ON u2.id = c.user2_id
        LEFT JOIN conversation_states s
          ON s.conversation_id = c.id AND s.user_id = ?
        WHERE (c.user1_id = ? OR c.user2_id = ?)
          AND COALESCE(s.hidden, 0) = 0
        ORDER BY last_created_at DESC, c.created_at DESC
    """, (me, me, me))

    rows = c.fetchall()

    convs = []
    for r in rows:
        if r["user1_id"] == me:
            other_id = r["user2_id"]
            other_name = r["user2_name"]
            other_role = r["user2_role"]
            other_avatar = r["user2_avatar"] or default_avatar_for(other_role)
        else:
            other_id = r["user1_id"]
            other_name = r["user1_name"]
            other_role = r["user1_role"]
            other_avatar = r["user1_avatar"] or default_avatar_for(other_role)

        c2 = conn.cursor()
        c2.execute("""
            SELECT last_read_at
            FROM conversation_reads
            WHERE conversation_id = ? AND user_id = ?
        """, (r["conversation_id"], me))
        rd = c2.fetchone()

        if rd and rd["last_read_at"]:
            last_read_at = rd["last_read_at"]
            c2.execute("""
                SELECT COUNT(*) AS cnt
                FROM messages
                WHERE conversation_id = ?
                  AND sender_id != ?
                  AND created_at > ?
            """, (r["conversation_id"], me, last_read_at))
        else:
            c2.execute("""
                SELECT COUNT(*) AS cnt
                FROM messages
                WHERE conversation_id = ?
                  AND sender_id != ?
            """, (r["conversation_id"], me))

        unread_count = c2.fetchone()["cnt"]
        unread = unread_count > 0

        convs.append({
            "id": r["conversation_id"],
            "other_user_id": other_id,
            "other_username": other_name,
            "other_avatar": other_avatar,
            "last_message": r["last_message"] or "",
            "last_created_at": r["last_created_at"],
            "unread": unread,
        })

    conn.close()
    return jsonify(convs)


@app.route("/api/messages/<int:msg_id>/delete", methods=["POST"])
def api_delete_message(msg_id):
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT id, conversation_id, sender_id FROM messages WHERE id = ?", (msg_id,))
    m = c.fetchone()
    if not m:
        conn.close()
        return jsonify({"error": "message not found"}), 404

    if m["sender_id"] != me:
        conn.close()
        return jsonify({"error": "forbidden"}), 403

    c.execute("SELECT user1_id, user2_id FROM conversations WHERE id = ?", (m["conversation_id"],))
    conv = c.fetchone()
    if not conv or me not in (conv["user1_id"], conv["user2_id"]):
        conn.close()
        return jsonify({"error": "forbidden"}), 403

    c.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "deleted_id": msg_id})


@app.route("/api/conversations/delete", methods=["POST"])
def api_delete_conversations():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    me = session["user_id"]
    data = request.get_json(force=True) or {}
    ids = data.get("conversation_ids") or []

    conv_ids = []
    for x in ids:
        try:
            conv_ids.append(int(x))
        except (TypeError, ValueError):
            continue

    if not conv_ids:
        return jsonify({"ok": True, "deleted": 0})

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    qmarks = ",".join(["?"] * len(conv_ids))
    c.execute(
        f"""
        SELECT id
        FROM conversations
        WHERE id IN ({qmarks})
          AND (user1_id = ? OR user2_id = ?)
        """,
        (*conv_ids, me, me),
    )
    allowed = [row["id"] for row in c.fetchall()]

    if not allowed:
        conn.close()
        return jsonify({"ok": True, "deleted": 0})

    qmarks2 = ",".join(["?"] * len(allowed))

    now = datetime.utcnow().isoformat(" ")
    for conv_id in allowed:
        ensure_conv_state(conn, conv_id, me)

    params1 = [now, me] + allowed
    c.execute(
        f"""
        UPDATE conversation_states
        SET hidden = 1,
            cleared_at = ?
        WHERE user_id = ?
          AND conversation_id IN ({qmarks2})
        """,
        params1,
    )

    params2 = [me] + allowed
    c.execute(
        f"""
        DELETE FROM conversation_reads
        WHERE user_id = ?
          AND conversation_id IN ({qmarks2})
        """,
        params2,
    )

    conn.commit()
    conn.close()

    return jsonify({"ok": True, "deleted": len(allowed)})


@app.route("/api/conversations/start", methods=["POST"])
def api_start_conversation():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True) or {}
    other_user_id = data.get("other_user_id")

    try:
        other_user_id = int(other_user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid other_user_id"}), 400

    me = session["user_id"]
    if other_user_id == me:
        return jsonify({"error": "cannot message yourself"}), 400

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT id, username FROM users WHERE id = ?", (other_user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "user not found"}), 404
    other_username = row["username"]

    u1, u2 = _sorted_pair(me, other_user_id)

    c.execute("SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?", (u1, u2))
    conv = c.fetchone()

    if conv:
        conv_id = conv["id"]
    else:
        c.execute("INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)", (u1, u2))
        conv_id = c.lastrowid
        conn.commit()

    ensure_conv_state(conn, conv_id, me)
    ensure_conv_state(conn, conv_id, other_user_id)
    c.execute("""
        UPDATE conversation_states
        SET hidden = 0
        WHERE conversation_id = ? AND user_id = ?
    """, (conv_id, me))

    c.execute("""
        SELECT cleared_at
        FROM conversation_states
        WHERE conversation_id = ? AND user_id = ?
    """, (conv_id, me))
    st = c.fetchone()
    cleared_at = st["cleared_at"] if st else None

    if cleared_at:
        c.execute("""
            SELECT id, sender_id, body, created_at
            FROM messages
            WHERE conversation_id = ?
              AND created_at > ?
            ORDER BY created_at ASC
        """, (conv_id, cleared_at))
    else:
        c.execute("""
            SELECT id, sender_id, body, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        """, (conv_id,))
    msgs = c.fetchall()

    last_read_at = datetime.utcnow().isoformat(" ")
    c.execute("""
        INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
        VALUES (?, ?, ?)
        ON CONFLICT(conversation_id, user_id)
        DO UPDATE SET last_read_at = excluded.last_read_at
    """, (conv_id, me, last_read_at))
    conn.commit()
    conn.close()

    messages = [{
        "id": m["id"],
        "body": m["body"],
        "created_at": m["created_at"],
        "from_me": (m["sender_id"] == me),
    } for m in msgs]

    return jsonify({
        "conversation_id": conv_id,
        "other_user_id": other_user_id,
        "other_username": other_username,
        "messages": messages,
    })


@app.route("/api/conversations/<int:conv_id>/messages", methods=["GET"])
def api_conversation_messages(conv_id):
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT c.*, u1.username AS user1_name, u2.username AS user2_name
        FROM conversations c
        JOIN users u1 ON u1.id = c.user1_id
        JOIN users u2 ON u2.id = c.user2_id
        WHERE c.id = ?
    """, (conv_id,))
    conv = c.fetchone()
    if not conv:
        conn.close()
        return jsonify({"error": "conversation not found"}), 404

    if me not in (conv["user1_id"], conv["user2_id"]):
        conn.close()
        return jsonify({"error": "forbidden"}), 403

    other_id = conv["user2_id"] if conv["user1_id"] == me else conv["user1_id"]
    other_username = conv["user2_name"] if conv["user1_id"] == me else conv["user1_name"]

    ensure_conv_state(conn, conv_id, me)

    c.execute("""
        SELECT cleared_at
        FROM conversation_states
        WHERE conversation_id = ? AND user_id = ?
    """, (conv_id, me))
    st = c.fetchone()
    cleared_at = st["cleared_at"] if st else None

    if cleared_at:
        c.execute("""
            SELECT id, sender_id, body, created_at
            FROM messages
            WHERE conversation_id = ?
              AND created_at > ?
            ORDER BY created_at ASC
        """, (conv_id, cleared_at))
    else:
        c.execute("""
            SELECT id, sender_id, body, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        """, (conv_id,))
    rows = c.fetchall()

    last_read_at = datetime.utcnow().isoformat(" ")
    c.execute("""
        INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
        VALUES (?, ?, ?)
        ON CONFLICT(conversation_id, user_id)
        DO UPDATE SET last_read_at = excluded.last_read_at
    """, (conv_id, me, last_read_at))
    conn.commit()
    conn.close()

    messages = [{
        "id": m["id"],
        "body": m["body"],
        "created_at": m["created_at"],
        "from_me": (m["sender_id"] == me),
    } for m in rows]

    return jsonify({
        "conversation_id": conv_id,
        "other_user_id": other_id,
        "other_username": other_username,
        "messages": messages,
    })


@app.route("/api/messages", methods=["POST"])
def api_send_message():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True) or {}
    conv_id = data.get("conversation_id")
    body = (data.get("body") or "").strip()

    if not body:
        return jsonify({"error": "empty body"}), 400

    try:
        conv_id = int(conv_id)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid conversation_id"}), 400

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT user1_id, user2_id FROM conversations WHERE id = ?", (conv_id,))
    conv = c.fetchone()
    if not conv:
        conn.close()
        return jsonify({"error": "conversation not found"}), 404

    if me not in (conv["user1_id"], conv["user2_id"]):
        conn.close()
        return jsonify({"error": "forbidden"}), 403

    c.execute("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)", (conv_id, me, body))
    msg_id = c.lastrowid

    c.execute("SELECT created_at FROM messages WHERE id = ?", (msg_id,))
    row = c.fetchone()

    other_id = conv["user2_id"] if conv["user1_id"] == me else conv["user1_id"]
    ensure_conv_state(conn, conv_id, other_id)
    c.execute("""
        UPDATE conversation_states
        SET hidden = 0
        WHERE conversation_id = ? AND user_id = ?
    """, (conv_id, other_id))

    conn.commit()
    conn.close()

    return jsonify({
        "id": msg_id,
        "conversation_id": conv_id,
        "body": body,
        "created_at": row["created_at"] if row else None,
        "from_me": True,
    })


# プロフィール検索-----------------------------
@app.route("/api/user_search", methods=["GET"])
def api_user_search():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT id, username, role, avatar_path
        FROM users
        WHERE username LIKE ?
          AND id != ?
        ORDER BY username ASC
        LIMIT 10
    """, (f"%{q}%", me))

    rows = c.fetchall()
    conn.close()

    users = []
    for r in rows:
        avatar = r["avatar_path"] or default_avatar_for(r["role"])
        users.append({
            "id": r["id"],
            "username": r["username"],
            "role": r["role"],
            "avatar": avatar,
        })
    return jsonify(users)


# 他人プロフィールの一覧 -------------------------------
@app.route("/user/<int:user_id>")
def user_profile(user_id):
    if "user_id" not in session:
        return redirect(url_for("login"))

    me = session["user_id"]

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT id, username, role, bio, avatar_path FROM users WHERE id = ?", (user_id,))
    user = c.fetchone()
    if not user:
        conn.close()
        return "User not found", 404

    avatar = user["avatar_path"] or default_avatar_for(user["role"])

    c.execute("SELECT COUNT(*) AS cnt FROM follows WHERE following_id = ?", (user_id,))
    follower_count = c.fetchone()["cnt"]

    c.execute("SELECT COUNT(*) AS cnt FROM follows WHERE follower_id = ?", (user_id,))
    following_count = c.fetchone()["cnt"]

    c.execute("""
        SELECT 1 FROM follows
        WHERE follower_id = ? AND following_id = ?
    """, (me, user_id))
    is_following = c.fetchone() is not None

    showcase_items = get_showcase_items(conn, user_id)
    conn.close()

    return render_template(
        "user_profile.html",
        user=user,
        avatar=avatar,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
        showcase_items=showcase_items,
    )


@app.route("/api/account/delete", methods=["POST"])
def api_account_delete():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"}), 401

    me = session["user_id"]
    data = request.get_json(force=True) or {}
    password = (data.get("password") or "").strip()

    if not password:
        return jsonify({"error": "password required"}), 400

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT password FROM users WHERE id = ?", (me,))
    row = c.fetchone()
    if not row:
        conn.close()
        session.clear()
        return jsonify({"error": "user not found"}), 404

    if row["password"] != password:
        conn.close()
        return jsonify({"error": "パスワードが正しくありません"}), 403

    c.execute("DELETE FROM messages WHERE sender_id = ?", (me,))
    c.execute("""
        DELETE FROM messages
        WHERE conversation_id IN (
            SELECT id FROM conversations WHERE user1_id = ? OR user2_id = ?
        )
    """, (me, me))
    c.execute("DELETE FROM conversation_reads WHERE user_id = ?", (me,))
    c.execute("DELETE FROM conversation_states WHERE user_id = ?", (me,))
    c.execute("DELETE FROM conversations WHERE user1_id = ? OR user2_id = ?", (me, me))

    c.execute("DELETE FROM follows WHERE follower_id = ? OR following_id = ?", (me, me))

    # Optional: delete R2 objects for showcase/posts for this user before deleting rows
    c.execute("SELECT media_path FROM showcase_items WHERE user_id = ?", (me,))
    for r in c.fetchall():
        key = r2_key_from_db_path(r["media_path"])
        if key:
            r2_delete_key(key)

    c.execute("SELECT media_path FROM posts WHERE user_id = ?", (me,))
    for r in c.fetchall():
        key = r2_key_from_db_path(r["media_path"])
        if key:
            r2_delete_key(key)

    # Optional: delete avatar object
    c.execute("SELECT avatar_path FROM users WHERE id = ?", (me,))
    av = c.fetchone()
    if av and av["avatar_path"]:
        key = r2_key_from_db_path(av["avatar_path"])
        if key:
            r2_delete_key(key)

    c.execute("DELETE FROM showcase_items WHERE user_id = ?", (me,))
    c.execute("DELETE FROM posts WHERE user_id = ?", (me,))
    c.execute("DELETE FROM users WHERE id = ?", (me,))

    conn.commit()
    conn.close()

    session.clear()
    return jsonify({"ok": True})


# ---- Run app ----
if __name__ == "__main__":
    init_db()
    app.run(port=5001, debug=True)

