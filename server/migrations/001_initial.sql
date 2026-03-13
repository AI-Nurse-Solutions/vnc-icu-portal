-- VNC ICU Vacation Request Portal - Initial Schema

CREATE TYPE shift_type AS ENUM ('AM', 'PM', 'NOC');
CREATE TYPE user_role AS ENUM ('employee', 'manager', 'admin');
CREATE TYPE request_type AS ENUM ('vacation', 'education');
CREATE TYPE continuity_type AS ENUM ('continuous', 'intermittent');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'denied', 'withdrawn');

CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  employee_number VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  seniority_date DATE NOT NULL,
  shift shift_type NOT NULL DEFAULT 'AM',
  email VARCHAR(255) UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  password_hash VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6),
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INT DEFAULT 0,
  otp_locked_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE requests (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id),
  request_type request_type NOT NULL,
  continuity_type continuity_type NOT NULL DEFAULT 'continuous',
  comment TEXT,
  status request_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by INT REFERENCES employees(id),
  decision_note TEXT,
  prior_status request_status,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE request_dates (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  UNIQUE(request_id, date)
);

CREATE TABLE blackout_dates (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  created_by INT REFERENCES employees(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE submission_deadlines (
  id SERIAL PRIMARY KEY,
  deadline_date DATE NOT NULL,
  coverage_start DATE NOT NULL,
  coverage_end DATE NOT NULL,
  year INT NOT NULL,
  created_by INT REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value VARCHAR(255) NOT NULL,
  updated_by INT REFERENCES employees(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES employees(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  details JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_requests_employee ON requests(employee_id);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_request_dates_date ON request_dates(date);
CREATE INDEX idx_request_dates_request ON request_dates(request_id);
CREATE INDEX idx_employees_shift ON employees(shift);
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- Default config values
INSERT INTO config (key, value) VALUES
  ('cap_am', '8'),
  ('cap_pm', '8'),
  ('cap_noc', '8'),
  ('color_yellow_threshold', '5'),
  ('color_red_threshold', '8'),
  ('deadline_reminder_days', '7');
