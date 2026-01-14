require("dotenv").config();
const express = require("express");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");

const app = express();
app.use(express.json());
app.use(express.static("public"));

let activeQR = null;

// Generate QR (Teacher)
app.get("/generateQR/:subject", async (req, res) => {
    const token = uuidv4();
  
    activeQR = {
      token,
      subject: req.params.subject,
      expires: Date.now() + 300000 // 5 minutes
    };
  
    const qrURL = `https://contrived-michal-nonegoistic.ngrok-free.dev/scan?token=${token}`;
    const qr = await QRCode.toDataURL(qrURL);
  
    res.json({ qr });
});
  
// Student Scan
app.post("/markAttendance", (req, res) => {
    const { roll_no, token } = req.body;
  
    // 1. Check QR validity
    if (!activeQR || activeQR.token !== token) {
      return res.status(400).json({ message: "Invalid QR" });
    }
  
    // 2. Check QR expiry
    if (Date.now() > activeQR.expires) {
      return res.status(400).json({ message: "QR Expired" });
    }
  
    // 3. Get student ID from roll number
    const studentSql = "SELECT id FROM students WHERE roll_no = ?";
    db.query(studentSql, [roll_no], (err, students) => {
      if (err) return res.status(500).json(err);
  
      if (students.length === 0) {
        return res.status(400).json({ message: "Invalid Roll Number" });
      }
  
      const student_id = students[0].id;
  
      // 4. Prevent duplicate attendance
      const checkSql = `
        SELECT * FROM attendance
        WHERE student_id = ?
          AND subject = ?
          AND date = CURDATE()
      `;
  
      db.query(checkSql, [student_id, activeQR.subject], (err, result) => {
        if (err) return res.status(500).json(err);
  
        if (result.length > 0) {
          return res.json({ message: "Attendance already marked" });
        }
  
        // 5. Insert attendance
        const insertSql = `
          INSERT INTO attendance (student_id, subject, date, time)
          VALUES (?, ?, CURDATE(), CURTIME())
        `;
  
        db.query(insertSql, [student_id, activeQR.subject], err => {
          if (err) return res.status(500).json(err);
  
          res.json({ message: "Attendance marked successfully" });
        });
      });
    });
});  
  
const path = require("path");

app.get("/scan", (req, res) => {
    res.sendFile(__dirname + "/public/login.html");
});  

app.get("/attendance", (req, res) => {
  const { date } = req.query;

  let sql = `
    SELECT s.name, s.roll_no, a.subject, a.date, a.time
    FROM attendance a
    JOIN students s ON s.id = a.student_id
  `;

  const params = [];

  if (date) {
    sql += " WHERE a.date = ?";
    params.push(date);
  }

  sql += " ORDER BY a.subject, a.time";

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});




app.get("/studentAttendance/:roll", (req, res) => {
  const roll = req.params.roll;

  const sql = `
    SELECT subject,
           COUNT(*) AS attended
    FROM attendance a
    JOIN students s ON s.id = a.student_id
    WHERE s.roll_no = ?
    GROUP BY subject
  `;

  db.query(sql, [roll], (err, attended) => {
    if (err) return res.status(500).json(err);

    // Assume total classes = 10 (or fetch from timetable if you want)
    const TOTAL_CLASSES = 10;

    const result = attended.map(a => ({
      subject: a.subject,
      attended: a.attended,
      total: TOTAL_CLASSES,
      percentage: ((a.attended / TOTAL_CLASSES) * 100).toFixed(2)
    }));

    res.json(result);
  });
});
  
app.post("/login", (req, res) => {
  const { role, username, password } = req.body;

  if (role === "teacher") {
    const sql = "SELECT * FROM teachers WHERE username=? AND password=?";
    db.query(sql, [username, password], (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.json({ success: false, message: "Invalid teacher login" });

      res.json({ success: true });
    });
  }

  if (role === "student") {
    const sql = "SELECT * FROM students WHERE roll_no=? AND password=?";
    db.query(sql, [username, password], (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.json({ success: false, message: "Invalid student login" });

      res.json({ success: true });
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});