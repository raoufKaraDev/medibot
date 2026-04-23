#!/usr/bin/env python3
"""
Script to delete all doctors and create a new one with new credentials.
"""
import sqlite3
import hashlib
from pathlib import Path

# Database path
DB_PATH = Path(__file__).parent / "backend" / "bot.db"

def get_db():
    """Get database connection."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_password(password: str) -> str:
    """Hash password using SHA256 (same as seed.py)."""
    return hashlib.sha256(password.encode()).hexdigest()

def delete_all_doctors(conn):
    """Delete all doctors from the database."""
    try:
        conn.execute("DELETE FROM doctors")
        conn.commit()
        rows_affected = conn.total_changes
        print(f"✓ All doctors deleted ({rows_affected} records removed)")
        return True
    except Exception as e:
        print(f"✗ Error deleting doctors: {e}")
        conn.rollback()
        return False

def create_doctor(conn, rfid_uid, name, role, pin, username, password):
    """Create a new doctor."""
    try:
        password_hash = hash_password(password)
        
        conn.execute("""
            INSERT INTO doctors(rfid_uid, name, role, pin, username, password_hash, status)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        """, (rfid_uid, name, role, pin, username, password_hash))
        
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        print(f"✓ New doctor created with ID: {new_id}")
        print(f"  Name: {name}")
        print(f"  Username: {username}")
        print(f"  Password: {password}")
        print(f"  RFID UID: {rfid_uid}")
        print(f"  PIN: {pin}")
        return True
    except Exception as e:
        print(f"✗ Error creating doctor: {e}")
        conn.rollback()
        return False

def main():
    """Main function."""
    print("=" * 60)
    print("DOCTOR MANAGEMENT SCRIPT")
    print("=" * 60)
    
    # Check database exists
    if not DB_PATH.exists():
        print(f"✗ Database not found at {DB_PATH}")
        return
    
    print(f"Database: {DB_PATH}")
    
    conn = get_db()
    
    try:
        # List current doctors
        doctors = conn.execute("SELECT id, name, username FROM doctors").fetchall()
        print(f"\nCurrent doctors: {len(doctors)}")
        for doc in doctors:
            print(f"  - {dict(doc)['name']} (@{dict(doc)['username']})")
        
        # Delete all doctors
        print("\n[Step 1] Deleting all doctors...")
        if not delete_all_doctors(conn):
            return
        
        # Create new doctor
        print("\n[Step 2] Creating new doctor...")
        new_doctor_data = {
            'rfid_uid': 'A1B2C3D4',
            'name': 'Dr. Admin',
            'role': 'CHEF_SERVICE',
            'pin': '1234',
            'username': 'admin',
            'password': 'AdminPassword123!'
        }
        
        if create_doctor(conn, **new_doctor_data):
            print("\n" + "=" * 60)
            print("SUCCESS! New doctor has been created.")
            print("=" * 60)
            print("\nLogin credentials:")
            print(f"  Username: {new_doctor_data['username']}")
            print(f"  Password: {new_doctor_data['password']}")
            print(f"  PIN: {new_doctor_data['pin']}")
            print(f"  RFID Badge: {new_doctor_data['rfid_uid']}")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()
