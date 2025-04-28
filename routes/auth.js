const express = require("express");
const bcrypt = require("bcryptjs"); // Use bcryptjs instead of bcrypt
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const router = express.Router();

// Database connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test database connection
pool
  .getConnection()
  .then(() => console.log("Connecté à MySQL (routes/auth)"))
  .catch((err) => console.error("Erreur MySQL (routes/auth):", err));

// Signup route
router.post("/signup", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    // Validate role (default to 'user' if not provided)
    const validRoles = ["user", "creator"];
    const userRole = validRoles.includes(role) ? role : "user";

    // Check if email already exists
    const [existingUser] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }

    // Hash the password using bcryptjs
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user with the specified role
    await pool.query(
      "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
      [email, hashedPassword, userRole]
    );

    res.status(201).json({ message: "Utilisateur créé", role: userRole });
  } catch (error) {
    console.error("Signup error:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de l’inscription", details: error.message });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (user.length === 0) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    // Compare password using bcryptjs
    const isMatch = await bcrypt.compare(password, user[0].password);
    if (!isMatch) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign(
      { email: user[0].email, role: user[0].role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token, role: user[0].role });
  } catch (error) {
    console.error("Login error:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de la connexion", details: error.message });
  }
});

module.exports = router;
