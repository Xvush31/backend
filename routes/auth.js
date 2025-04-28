const express = require("express");
const bcrypt = require("bcryptjs"); // Corrected to use bcryptjs
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const { OAuth2Client } = require("google-auth-library");
const fetch = require("node-fetch");

const router = express.Router();

// Google OAuth2Client
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri:
    "https://backend-puce-rho-15.vercel.app/api/auth/google/callback",
});

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

// Signup route (manual signup)
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

    // Generate JWT token
    const token = jwt.sign({ email, role: userRole }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res
      .status(201)
      .json({ message: "Utilisateur créé", role: userRole, token });
  } catch (error) {
    console.error("Signup error:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de l’inscription", details: error.message });
  }
});

// Login route (manual login)
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

// Google OAuth routes
router.get("/google", (req, res) => {
  const { role } = req.query; // Role passed from frontend
  const url = googleClient.generateAuthUrl({
    scope: ["profile", "email"],
    state: JSON.stringify({ role: role || "user" }), // Pass role in state
  });
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const { role } = JSON.parse(state); // Extract role from state

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Get user info
    const userInfo = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    ).then((res) => res.json());

    const email = userInfo.email;
    if (!email) {
      return res.status(400).json({ error: "Email non trouvé via Google" });
    }

    // Check if user exists
    const [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    let userRole = role;

    if (user.length === 0) {
      // New user: create account
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, "", userRole] // No password for OAuth users
      );
    } else {
      // Existing user: use their existing role
      userRole = user[0].role;
    }

    // Generate JWT token
    const token = jwt.sign({ email, role: userRole }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Redirect to frontend with token and role
    res.redirect(
      `https://xvush.com/auth/callback?token=${token}&role=${userRole}`
    );
  } catch (error) {
    console.error("Google OAuth error:", error);
    res.status(500).json({ error: "Erreur lors de l’authentification Google" });
  }
});

// Apple OAuth routes (simplified)
router.get("/apple", (req, res) => {
  const { role } = req.query; // Role passed from frontend
  const redirectUri =
    "https://backend-puce-rho-15.vercel.app/api/auth/apple/callback";
  const authUrl = `https://appleid.apple.com/auth/authorize?client_id=${
    process.env.APPLE_CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=email&state=${JSON.stringify({
    role: role || "user",
  })}`;
  res.redirect(authUrl);
});

router.get("/apple/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const { role } = JSON.parse(state); // Extract role from state

    // Exchange code for tokens (simplified; requires proper Apple client secret generation)
    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.APPLE_CLIENT_ID,
        client_secret: process.env.APPLE_CLIENT_SECRET, // Must be generated dynamically
        code,
        grant_type: "authorization_code",
        redirect_uri:
          "https://backend-puce-rho-15.vercel.app/api/auth/apple/callback",
      }),
    }).then((res) => res.json());

    if (!tokenResponse.id_token) {
      return res
        .status(400)
        .json({ error: "Erreur lors de l’authentification Apple" });
    }

    // Decode the id_token to get user info (simplified)
    const [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      "apple-user@example.com", // Replace with actual email extraction from id_token
    ]);
    let userRole = role;

    if (user.length === 0) {
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        ["apple-user@example.com", "", userRole] // Replace email
      );
    } else {
      userRole = user[0].role;
    }

    const token = jwt.sign(
      { email: "apple-user@example.com", role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.redirect(
      `https://xvush.com/auth/callback?token=${token}&role=${userRole}`
    );
  } catch (error) {
    console.error("Apple OAuth error:", error);
    res.status(500).json({ error: "Erreur lors de l’authentification Apple" });
  }
});

module.exports = router;
