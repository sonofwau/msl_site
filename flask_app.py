# flask_app.py

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, g
import mysql.connector
from mysql.connector import errorcode
import os
import uuid
from datetime import datetime, timedelta
from functools import wraps
from passlib.hash import pbkdf2_sha256 # For password hashing

app = Flask(__name__)
app.secret_key = os.urandom(24) # Strong secret key for sessions

# --- MySQL Configuration ---
# IMPORTANT: Store these securely, e.g., environment variables or a config file
DB_CONFIG = {
    'user': 'sonofwau',
    'password': 'lolno',
    'host': 'sonofwau.mysql.pythonanywhere-services.com', # e.g., 'yourusername.mysql.pythonanywhere-services.com'
    'database': 'sonofwau$insert_db_name', # Create this database in MySQL
    'raise_on_warnings': True
}

# --- Database Helper Functions ---
def get_db():
    if 'db' not in g:
        try:
            g.db = mysql.connector.connect(**DB_CONFIG)
        except mysql.connector.Error as err:
            if err.errno == errorcode.ER_ACCESS_DENIED_ERROR:
                print("Something is wrong with your user name or password")
            elif err.errno == errorcode.ER_BAD_DB_ERROR:
                print(f"Database '{DB_CONFIG['database']}' does not exist.")
                # Attempt to create it (simple version, might need more permissions)
                temp_conn_config = DB_CONFIG.copy()
                del temp_conn_config['database']
                try:
                    with mysql.connector.connect(**temp_conn_config) as temp_conn:
                        with temp_conn.cursor() as cursor:
                            cursor.execute(f"CREATE DATABASE {DB_CONFIG['database']} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                            print(f"Database {DB_CONFIG['database']} created successfully.")
                    g.db = mysql.connector.connect(**DB_CONFIG) # Retry connection
                except mysql.connector.Error as create_err:
                    print(f"Failed to create database: {create_err}")
                    raise create_err # Could not create DB
            else:
                print(err)
            raise # Re-raise the error to stop the app if DB connection fails
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def query_db(query, args=None, one=False, commit=False, is_ddl=False):
    db_conn = get_db()
    cursor = db_conn.cursor(dictionary=True if not is_ddl else False) # dictionary=True returns rows as dicts
    try:
        cursor.execute(query, args or ())
        if commit or is_ddl:
            db_conn.commit()
            return cursor.rowcount # For INSERT/UPDATE/DELETE/DDL

        if one:
            result = cursor.fetchone()
            return result
        else:
            result = cursor.fetchall()
            return result
    except mysql.connector.Error as err:
        print(f"MySQL Error: {err}")
        print(f"Query: {query}")
        print(f"Args: {args}")
        db_conn.rollback() # Rollback on error
        raise err # Re-raise
    finally:
        cursor.close()


def format_datetime_for_sql(dt_obj):
    # MySQL DATETIME format is 'YYYY-MM-DD HH:MM:SS'
    if isinstance(dt_obj, str):
        # Potentially parse and reformat if needed, or assume it's okay
        return dt_obj
    if dt_obj == datetime.max:
        return "9999-12-31 23:59:59" # MySQL max datetime
    if isinstance(dt_obj, datetime):
        return dt_obj.strftime("%Y-%m-%d %H:%M:%S")
    return None

def new_id():
    return uuid.uuid4().hex[:8]

def create_tables_if_not_exist():
    tables = {
        "Users": """
            CREATE TABLE IF NOT EXISTS Users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(80) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """,
        "Tasks": """
            CREATE TABLE IF NOT EXISTS Tasks (
                ID VARCHAR(8) PRIMARY KEY,
                Title VARCHAR(255),
                Due DATETIME,
                Date_Opened DATETIME,
                State INT,
                Date_Closed DATETIME,
                Creator_Username VARCHAR(80),
                Closor_Username VARCHAR(80),
                Summary TEXT,
                UI INT,
                FOREIGN KEY (Creator_Username) REFERENCES Users(username) ON DELETE SET NULL,
                FOREIGN KEY (Closor_Username) REFERENCES Users(username) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """,
        "MSLEntry": """
            CREATE TABLE IF NOT EXISTS MSLEntry (
                EntryID VARCHAR(8) PRIMARY KEY,
                TaskID VARCHAR(8) NOT NULL,
                Date DATETIME,
                Text TEXT,
                Submitter_Username VARCHAR(80),
                Submitter_FullName VARCHAR(255),
                FOREIGN KEY (TaskID) REFERENCES Tasks(ID) ON DELETE CASCADE,
                FOREIGN KEY (Submitter_Username) REFERENCES Users(username) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    }
    for table_name, ddl_query in tables.items():
        try:
            print(f"Creating table {table_name} if not exists...")
            query_db(ddl_query, is_ddl=True)
            print(f"Table {table_name} checked/created.")
        except mysql.connector.Error as err:
            print(f"Error creating table {table_name}: {err}")
            # Depending on the error, you might want to stop the app
    print("Database tables checked/created.")

# --- Authentication ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login', next=request.url))
        g.user = query_db("SELECT id, username, full_name FROM Users WHERE id = %s", (session['user_id'],), one=True)
        if not g.user: # User deleted from DB while session active
            session.clear()
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        full_name = request.form['full_name']

        if not username or not password or not full_name:
            return "Missing fields", 400

        existing_user = query_db("SELECT id FROM Users WHERE username = %s", (username,), one=True)
        if existing_user:
            return "Username already exists", 400

        password_hash = pbkdf2_sha256.hash(password)
        try:
            query_db("INSERT INTO Users (username, password_hash, full_name) VALUES (%s, %s, %s)",
                     (username, password_hash, full_name), commit=True)
            return redirect(url_for('login'))
        except mysql.connector.Error as err:
            return f"Registration failed: {err}", 500
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = query_db("SELECT id, username, password_hash, full_name FROM Users WHERE username = %s", (username,), one=True)

        if user and pbkdf2_sha256.verify(password, user['password_hash']):
            session.clear()
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['full_name'] = user['full_name']
            next_url = request.args.get('next') or url_for('index')
            return redirect(next_url)
        return "Invalid credentials", 401
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# --- Main Application Logic ---
def get_current_user_username():
    return session.get('username')

def get_current_user_fullname():
    return session.get('full_name')

# (Adapted from your PowerShell script logic for get_tasks_data, get_msl_entries_data)
# These functions will now use MySQL queries and refer to the logged-in user from session.

def get_tasks_logic(filter_property="Filter_UI"):
    # Filter by logged-in user, or show all if admin (not implemented here)
    # For simplicity, let's assume users see tasks they created or are assigned to (not in original schema)
    # The original script didn't filter tasks by user, just showed all active.
    # We will keep that for now, but Creator_Username and Closor_Username are available.

    tasks = query_db("SELECT * FROM Tasks WHERE State = 1") # State = 1 for active
    processed_tasks = []

    for task in tasks:
        # UI Filter Text
        ui_val = task.get("UI")
        if ui_val == 1: task["Filter_UI_Text"] = "---Urgent + Important---"
        elif ui_val == 2: task["Filter_UI_Text"] = "---Important + Not-Urgent---"
        elif ui_val == 3: task["Filter_UI_Text"] = "---Urgent + Not-Important---"
        elif ui_val == 4: task["Filter_UI_Text"] = "---Not-Urgent + Not-Important---"
        else: task["Filter_UI_Text"] = "---Uncategorized---"

        # Date Filter Text
        due_date = task.get("Due") # This will be a datetime object from MySQL connector
        time_val = "---Later---"
        if isinstance(due_date, datetime):
            time_span = due_date - datetime.now()

            # Calculate total days as a float
            total_days_float = time_span.total_seconds() / (24 * 60 * 60) # or time_span.total_seconds() / 86400.0

            if total_days_float < 0: # Use total_days_float for comparison
                time_val = "---Overdue---"
            elif 0 <= total_days_float <= 1: # Use total_days_float
                time_val = "---Today---"
            elif 1 < total_days_float <= 7: # Use total_days_float
                time_val = "---This Week---"
            elif 7 < total_days_float <= 14: # Use total_days_float
                time_val = "---Next Week---"
        task["Filter_Date_Text"] = time_val

        # Convert datetime objects to ISO strings for JSON serialization
        for key, value in task.items():
            if isinstance(value, datetime):
                task[key] = value.isoformat()
        processed_tasks.append(task)

    # Sorting logic (same as before, but applied to dicts from MySQL)
    if filter_property == "Filter_UI":
        custom_sort_order = ["---Urgent + Important---", "---Important + Not-Urgent---", "---Urgent + Not-Important---", "---Uncategorized---", "---Not-Urgent + Not-Important---"]
        processed_tasks.sort(key=lambda t: custom_sort_order.index(t["Filter_UI_Text"]) if t["Filter_UI_Text"] in custom_sort_order else len(custom_sort_order))
    elif filter_property == "Filter_Date":
        custom_sort_order = ["---Overdue---", "---Today---", "---This Week---", "---Next Week---", "---Later---"]
        processed_tasks.sort(key=lambda t: custom_sort_order.index(t["Filter_Date_Text"]) if t["Filter_Date_Text"] in custom_sort_order else len(custom_sort_order))

    return processed_tasks


def get_msl_entries_logic(task_id):
    entries = query_db("SELECT * FROM MSLEntry WHERE TaskID = %s ORDER BY Date", (task_id,))
    for entry in entries:
        for key, value in entry.items():
            if isinstance(value, datetime):
                entry[key] = value.isoformat()
    return entries

# --- API Endpoints ---
@app.route('/')
@login_required
def index():
    return render_template('index.html', username=get_current_user_username())

@app.route('/api/tasks', methods=['GET'])
@login_required
def api_get_tasks():
    filter_prop = request.args.get('filter_by', 'Filter_UI')
    tasks = get_tasks_logic(filter_property=filter_prop)
    return jsonify(tasks)

@app.route('/api/task', methods=['POST'])
@login_required
def api_add_task():
    data = request.json
    task_id = new_id()
    creator_username = get_current_user_username()

    # Validate and parse due date
    due_date_str = data.get('Due')
    try:
        due_date = datetime.fromisoformat(due_date_str) if due_date_str else datetime.now() + timedelta(days=7)
    except ValueError:
        due_date = datetime.now() + timedelta(days=7) # Default if format is bad

    sql = """
        INSERT INTO Tasks (ID, Title, Due, Date_Opened, State, Date_Closed, Creator_Username, Summary, UI)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    args = (
        task_id,
        data.get('Title', 'New Task'),
        format_datetime_for_sql(due_date),
        format_datetime_for_sql(datetime.now()),
        1, # State: Active
        None, # Date_Closed
        creator_username,
        data.get('Summary', ''),
        int(data.get('UI', 0))
    )
    try:
        query_db(sql, args, commit=True)
        new_task = query_db("SELECT * FROM Tasks WHERE ID = %s", (task_id,), one=True)
        if new_task and isinstance(new_task.get('Due'), datetime): new_task['Due'] = new_task['Due'].isoformat()
        if new_task and isinstance(new_task.get('Date_Opened'), datetime): new_task['Date_Opened'] = new_task['Date_Opened'].isoformat()
        return jsonify(new_task), 201
    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/task/<task_id>', methods=['PUT'])
@login_required
def api_update_task(task_id):
    data = request.json

    # Build SET clause dynamically to only update provided fields
    set_clauses = []
    args = []

    # Fields allowed to be updated (map frontend name to DB column name if different)
    allowed_fields = {"Title": "Title", "Summary": "Summary", "UI": "UI", "Due": "Due"}

    for field_key, db_column in allowed_fields.items():
        if field_key in data:
            value = data[field_key]
            if field_key == "UI":
                value = int(value)
            elif field_key == "Due":
                try:
                    value = datetime.fromisoformat(value) if value else None
                    value = format_datetime_for_sql(value)
                except ValueError:
                    return jsonify({"error": f"Invalid date format for Due: {data[field_key]}"}), 400
            set_clauses.append(f"{db_column} = %s")
            args.append(value)

    if not set_clauses:
        return jsonify({"error": "No updateable fields provided"}), 400

    args.append(task_id) # For WHERE ID = %s
    sql = f"UPDATE Tasks SET {', '.join(set_clauses)} WHERE ID = %s"

    try:
        query_db(sql, tuple(args), commit=True)
        updated_task = query_db("SELECT * FROM Tasks WHERE ID = %s", (task_id,), one=True)
        # Ensure datetime fields are ISO formatted for JSON
        for key in ['Due', 'Date_Opened', 'Date_Closed']:
            if updated_task and isinstance(updated_task.get(key), datetime):
                updated_task[key] = updated_task[key].isoformat()
        return jsonify(updated_task)
    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/task/<task_id>/complete', methods=['POST'])
@login_required
def api_complete_task(task_id):
    closor_username = get_current_user_username()
    sql = "UPDATE Tasks SET State = 0, Closor_Username = %s, Date_Closed = %s WHERE ID = %s"
    args = (closor_username, format_datetime_for_sql(datetime.now()), task_id)
    try:
        query_db(sql, args, commit=True)
        return jsonify({"message": "Task completed"}), 200
    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/msl_entries/<task_id>', methods=['GET'])
@login_required
def api_get_msl_entries(task_id):
    entries = get_msl_entries_logic(task_id)
    return jsonify(entries)

@app.route('/api/msl_entry', methods=['POST'])
@login_required
def api_add_msl_entry():
    data = request.json
    task_id = data.get('TaskID')
    text_content = data.get('Text')
    if not task_id or not text_content:
        return jsonify({"error": "TaskID and Text are required"}), 400

    entry_id = new_id()
    submitter_username = get_current_user_username()
    submitter_fullname = get_current_user_fullname()

    sql = """
        INSERT INTO MSLEntry (EntryID, TaskID, Date, Text, Submitter_Username, Submitter_FullName)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    args = (
        entry_id, task_id, format_datetime_for_sql(datetime.now()),
        text_content, submitter_username, submitter_fullname
    )
    try:
        query_db(sql, args, commit=True)
        new_entry = query_db("SELECT * FROM MSLEntry WHERE EntryID = %s", (entry_id,), one=True)
        if new_entry and isinstance(new_entry.get('Date'), datetime): new_entry['Date'] = new_entry['Date'].isoformat()
        return jsonify(new_entry), 201
    except mysql.connector.Error as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Create tables on first run if they don't exist
    # This is a simplified approach; migrations are better for production
    try:
        with app.app_context(): # Need app context for get_db()
             # Ensure DB exists before creating tables
            conn = get_db() # This will attempt to create the DB if it doesn't exist (basic)
            if conn: # If connection was successful
                create_tables_if_not_exist()
    except Exception as e:
        print(f"Failed to initialize database or tables: {e}")
        print("Please ensure MySQL is running, the database exists, and user has permissions, or that the app can create the database.")
        # sys.exit(1) # Optionally exit if DB setup fails

    app.run(debug=True) # debug=True is for development only
