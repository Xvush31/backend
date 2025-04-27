const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();

// Configuration de la base de données
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Clé secrète pour JWT (à stocker dans une variable d’environnement)
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

// Client Google pour vérifier les tokens Google
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Route pour l'inscription
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    // Vérifier si l'email existe déjà
    const [existingUser] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }

    // Insérer le nouvel utilisateur (par défaut, rôle 'user')
    await pool.query(
      "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
      [email, password, "user"]
    );

    res.status(200).json({ message: "Utilisateur créé" });
  } catch (error) {
    console.error("Erreur lors de l’inscription:", error);
    res.status(500).json({ error: "Erreur lors de l’inscription" });
  }
});

// Route pour la connexion email/mot de passe
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const [user] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND password = ?",
      [email, password]
    );
    if (user.length === 0) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign(
      { email: user[0].email, role: user[0].role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token, role: user[0].role });
  } catch (error) {
    console.error("Erreur lors de la connexion:", error);
    res.status(500).json({ error: "Erreur lors de la connexion" });
  }
});

// Route pour Google
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token requis" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload["email"];

    // Vérifier si l'utilisateur existe
    let [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (user.length === 0) {
      // Créer un nouvel utilisateur (par défaut, rôle 'user')
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, null, "user"]
      );
      [user] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    }

    const jwtToken = jwt.sign(
      { email: user[0].email, role: user[0].role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token: jwtToken, role: user[0].role });
  } catch (error) {
    console.error("Erreur lors de la connexion Google:", error);
    res.status(401).json({ error: "Échec de l’authentification Google" });
  }
});

// Route pour Apple
router.post("/apple", async (req, res) => {
  try {
    const { authorization } = req.body;
    if (!authorization || !authorization.id_token) {
      return res.status(400).json({ error: "Token Apple requis" });
    }

    // Vérification simplifiée du token Apple (à améliorer avec une vraie vérification)
    const decoded = jwt.decode(authorization.id_token);
    const email = decoded.email;

    if (!email) {
      return res
        .status(400)
        .json({ error: "Email non trouvé dans le token Apple" });
    }

    // Vérifier si l'utilisateur existe
    let [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (user.length === 0) {
      // Créer un nouvel utilisateur (par défaut, rôle 'user')
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, null, "user"]
      );
      [user] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    }

    const jwtToken = jwt.sign(
      { email: user[0].email, role: user[0].role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token: jwtToken, role: user[0].role });
  } catch (error) {
    console.error("Erreur lors de la connexion Apple:", error);
    res.status(500).json({ error: "Erreur lors de l’authentification Apple" });
  }
});

module.exports = router;
