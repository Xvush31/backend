const express = require("express");
const cors = require("cors");
const TronWeb = require("tronweb");
require("dotenv").config();
const authRoutes = require("./routes/auth");

const app = express();

// Connexion à MySQL
const mysql = require("mysql2/promise");
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test de la connexion à MySQL
pool
  .getConnection()
  .then(() => console.log("Connecté à MySQL"))
  .catch((err) => console.error("Erreur MySQL:", err));

// Configuration de TronWeb (version 4.4.0)
const tronWeb = new TronWeb(
  "https://api.trongrid.io", // fullNode
  "https://api.trongrid.io", // solidityNode
  "https://api.trongrid.io", // eventServer
  process.env.TRON_PRIVATE_KEY
);

// Middleware pour parser les requêtes JSON
app.use(express.json());

// Configuration de CORS
app.use(
  cors({
    origin: [
      "https://xvush-frontend.vercel.app",
      "https://xvush.com",
      "https://www.xvush.com", // Ajout de www.xvush.com
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Ajout de OPTIONS
    credentials: true,
  })
);

// Route de test
app.get("/", (req, res) => {
  res.json({ message: "Bienvenue sur le backend de XVush !" });
});

// Utiliser les routes d’authentification
app.use("/api/auth", authRoutes);

// Route pour récupérer tous les créateurs
app.get("/api/creators", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM creators");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des créateurs" });
  }
});

// Route pour l'inscription d'un créateur
app.post("/api/creators/register", async (req, res) => {
  try {
    const { id, username, email, walletAddress } = req.body;

    // Vérifier si tous les champs obligatoires sont présents
    if (!id || !username || !email) {
      return res
        .status(400)
        .json({ error: "ID, username et email sont requis" });
    }

    // Compter le nombre de créateurs déjà inscrits
    const [countResult] = await pool.query(
      "SELECT COUNT(*) as count FROM creators"
    );
    const creatorCount = countResult[0].count;

    // Déterminer si le créateur est Early Bird (dans les 500 premiers)
    const isEarlyBird = creatorCount < 500 ? 1 : 0;
    // Déterminer si le créateur a le bonus spécial (dans les 100 premiers)
    const earlyBirdBonus = creatorCount < 100 ? 90.0 : 0.0; // 90 % à vie pour les 100 premiers

    // Insérer le créateur dans la table creators
    await pool.query(
      "INSERT INTO creators (id, username, email, walletAddress, isEarlyBird, earlyBirdBonus) VALUES (?, ?, ?, ?, ?, ?)",
      [id, username, email, walletAddress || null, isEarlyBird, earlyBirdBonus]
    );

    // Initialiser les conditions Early Bird pour ce créateur
    await pool.query(
      "INSERT INTO creator_conditions (creatorId, promoPost, freeVideos, premiumVideos, conditionsMet) VALUES (?, ?, ?, ?, ?)",
      [id, 0, 0, 0, 0]
    );

    // Envoyer une notification de bienvenue
    if (isEarlyBird) {
      await pool.query(
        "INSERT INTO notifications (creatorId, message) VALUES (?, ?)",
        [
          id,
          "Bienvenue sur XVush ! Tu es Early Bird. Remplis les conditions (1 post, 3 vidéos gratuites, 3 vidéos premium) dans les 10 jours pour bénéficier de ton bonus !",
        ]
      );
    }

    res.status(201).json({
      message: "Créateur inscrit avec succès",
      isEarlyBird,
      earlyBirdBonus,
      creatorPosition: creatorCount + 1,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de l'inscription" });
  }
});

// Route pour mettre à jour les conditions Early Bird d'un créateur
app.put("/api/creators/:id/conditions", async (req, res) => {
  try {
    const creatorId = req.params.id;
    const { promoPost, freeVideos, premiumVideos } = req.body;

    // Vérifier si le créateur existe
    const [creator] = await pool.query("SELECT * FROM creators WHERE id = ?", [
      creatorId,
    ]);
    if (creator.length === 0) {
      return res.status(404).json({ error: "Créateur non trouvé" });
    }

    // Vérifier si le créateur est Early Bird
    if (!creator[0].isEarlyBird) {
      return res
        .status(400)
        .json({ error: "Ce créateur n'est pas Early Bird" });
    }

    // Calculer si on est dans les 10 jours suivant l'inscription
    const joinDate = new Date(creator[0].joinedAt);
    const now = new Date();
    const daysSinceJoin = (now - joinDate) / (1000 * 60 * 60 * 24); // Convertir en jours
    if (daysSinceJoin > 10) {
      return res.status(400).json({
        error:
          "La période de 10 jours pour remplir les conditions est dépassée",
      });
    }

    // Mettre à jour les compteurs dans creator_conditions
    await pool.query(
      "UPDATE creator_conditions SET promoPost = ?, freeVideos = ?, premiumVideos = ? WHERE creatorId = ?",
      [promoPost || 0, freeVideos || 0, premiumVideos || 0, creatorId]
    );

    // Récupérer les compteurs mis à jour
    const [conditions] = await pool.query(
      "SELECT * FROM creator_conditions WHERE creatorId = ?",
      [creatorId]
    );

    // Vérifier si les conditions sont remplies
    const conditionsMet =
      conditions[0].promoPost >= 1 &&
      conditions[0].freeVideos >= 3 &&
      conditions[0].premiumVideos >= 3;

    // Mettre à jour conditionsMet si nécessaire
    if (conditionsMet) {
      await pool.query(
        "UPDATE creator_conditions SET conditionsMet = 1 WHERE creatorId = ?",
        [creatorId]
      );
      // Envoyer une notification de félicitations
      await pool.query(
        "INSERT INTO notifications (creatorId, message) VALUES (?, ?)",
        [
          creatorId,
          "Félicitations ! Tu as rempli les conditions Early Bird et bénéficies maintenant de ton bonus !",
        ]
      );
    }

    res.json({
      message: "Conditions mises à jour",
      conditions: {
        promoPost: conditions[0].promoPost,
        freeVideos: conditions[0].freeVideos,
        premiumVideos: conditions[0].premiumVideos,
        conditionsMet: conditionsMet ? 1 : 0,
        daysRemaining: Math.max(0, 10 - Math.floor(daysSinceJoin)),
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Erreur lors de la mise à jour des conditions" });
  }
});

// Route pour confirmer un paiement et envoyer la part au créateur
app.post("/api/payment/confirm", async (req, res) => {
  try {
    const { creatorId, txId, amount } = req.body;

    // Vérifier si tous les champs sont présents
    if (!creatorId || !txId || !amount) {
      return res
        .status(400)
        .json({ error: "creatorId, txId et amount sont requis" });
    }

    // Vérifier si le créateur existe
    const [creator] = await pool.query("SELECT * FROM creators WHERE id = ?", [
      creatorId,
    ]);
    if (creator.length === 0) {
      return res.status(404).json({ error: "Créateur non trouvé" });
    }

    // Vérifier si le créateur a un wallet
    if (!creator[0].walletAddress) {
      return res
        .status(400)
        .json({ error: "Aucune adresse de wallet définie pour ce créateur" });
    }

    // Vérifier la transaction via Tronscan (simulation ici)
    const transaction = await tronWeb.trx.getTransaction(txId);
    if (
      !transaction ||
      !transaction.ret ||
      transaction.ret[0].contractRet !== "SUCCESS"
    ) {
      return res
        .status(400)
        .json({ error: "Transaction invalide ou non confirmée" });
    }

    // Vérifier si le montant correspond à une transaction USDT (simulation simplifiée)
    const expectedAmount = amount * 1000000; // Convertir en SUN (1 USDT = 1,000,000 SUN)
    if (
      !transaction.raw_data.contract[0].parameter.value.amount ||
      transaction.raw_data.contract[0].parameter.value.amount !== expectedAmount
    ) {
      return res
        .status(400)
        .json({ error: "Montant de la transaction incorrect" });
    }

    // Récupérer les conditions Early Bird
    const [conditions] = await pool.query(
      "SELECT * FROM creator_conditions WHERE creatorId = ?",
      [creatorId]
    );
    const conditionsMet = conditions[0].conditionsMet;

    // Calculer la part du créateur
    let creatorSharePercent = 70; // Par défaut
    if (creator[0].isEarlyBird && conditionsMet) {
      creatorSharePercent = creator[0].earlyBirdBonus > 0 ? 90 : 80; // 90 % pour les 100 premiers, 80 % pour les 500 premiers
    }
    const creatorShare = (amount * creatorSharePercent) / 100;

    // Envoyer la part du créateur directement à son wallet (USDT TRC-20)
    const contract = await tronWeb
      .contract()
      .at("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"); // Adresse du contrat USDT TRC-20
    const amountInSun = creatorShare * 1000000; // Convertir en SUN
    const result = await contract
      .transfer(creator[0].walletAddress, amountInSun)
      .send({
        feeLimit: 10000000,
        callValue: 0,
      });

    if (!result) {
      return res
        .status(500)
        .json({ error: "Échec de l'envoi des fonds au créateur" });
    }

    // Mettre à jour les revenus du créateur dans la table creators
    await pool.query("UPDATE creators SET revenue = revenue + ? WHERE id = ?", [
      creatorShare,
      creatorId,
    ]);

    // Envoyer une notification de paiement
    await pool.query(
      "INSERT INTO notifications (creatorId, message) VALUES (?, ?)",
      [creatorId, `Paiement reçu ! Tu as gagné ${creatorShare} USDT.`]
    );

    res.json({
      message: "Paiement confirmé, fonds envoyés au créateur",
      creatorShare,
      transactionId: result,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Erreur lors de la confirmation du paiement" });
  }
});

// Route pour vérifier le statut d'un créateur
app.get("/api/creators/:id/status", async (req, res) => {
  try {
    const creatorId = req.params.id;

    // Vérifier si le créateur existe
    const [creator] = await pool.query("SELECT * FROM creators WHERE id = ?", [
      creatorId,
    ]);
    if (creator.length === 0) {
      return res.status(404).json({ error: "Créateur non trouvé" });
    }

    // Récupérer les conditions Early Bird
    const [conditions] = await pool.query(
      "SELECT * FROM creator_conditions WHERE creatorId = ?",
      [creatorId]
    );
    if (conditions.length === 0) {
      return res
        .status(404)
        .json({ error: "Conditions non trouvées pour ce créateur" });
    }

    // Calculer le temps restant pour remplir les conditions (si Early Bird)
    let daysRemaining = 0;
    let deadlinePassed = false;
    if (creator[0].isEarlyBird) {
      const joinDate = new Date(creator[0].joinedAt);
      const now = new Date();
      const daysSinceJoin = (now - joinDate) / (1000 * 60 * 60 * 24); // Convertir en jours
      daysRemaining = Math.max(0, 10 - Math.floor(daysSinceJoin));
      deadlinePassed = daysSinceJoin > 10;
    }

    // Déterminer le pourcentage de partage actuel
    let sharePercent = 70; // Par défaut
    if (creator[0].isEarlyBird && conditions[0].conditionsMet) {
      sharePercent = creator[0].earlyBirdBonus > 0 ? 90 : 80;
    }

    res.json({
      creatorId: creator[0].id,
      username: creator[0].username,
      isEarlyBird: creator[0].isEarlyBird,
      earlyBirdBonus: creator[0].earlyBirdBonus,
      conditions: {
        promoPost: conditions[0].promoPost,
        freeVideos: conditions[0].freeVideos,
        premiumVideos: conditions[0].premiumVideos,
        conditionsMet: conditionsMet ? 1 : 0,
        daysRemaining: daysRemaining,
        deadlinePassed: deadlinePassed,
      },
      revenue: creator[0].revenue,
      sharePercent: sharePercent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la vérification du statut" });
  }
});

// Route pour envoyer une notification manuellement (pour tester)
app.post("/api/notifications/send", async (req, res) => {
  try {
    const { creatorId, message } = req.body;

    // Vérifier si tous les champs sont présents
    if (!creatorId || !message) {
      return res
        .status(400)
        .json({ error: "creatorId et message sont requis" });
    }

    // Vérifier si le créateur existe
    const [creator] = await pool.query("SELECT * FROM creators WHERE id = ?", [
      creatorId,
    ]);
    if (creator.length === 0) {
      return res.status(404).json({ error: "Créateur non trouvé" });
    }

    // Insérer la notification dans la table
    await pool.query(
      "INSERT INTO notifications (creatorId, message) VALUES (?, ?)",
      [creatorId, message]
    );

    res.status(201).json({ message: "Notification envoyée avec succès" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Erreur lors de l'envoi de la notification" });
  }
});

// Route pour récupérer les notifications d'un créateur
app.get("/api/creators/:id/notifications", async (req, res) => {
  try {
    const creatorId = req.params.id;

    // Vérifier si le créateur existe
    const [creator] = await pool.query("SELECT * FROM creators WHERE id = ?", [
      creatorId,
    ]);
    if (creator.length === 0) {
      return res.status(404).json({ error: "Créateur non trouvé" });
    }

    // Récupérer les notifications
    const [notifications] = await pool.query(
      "SELECT id, message, sentAt FROM notifications WHERE creatorId = ? ORDER BY sentAt DESC",
      [creatorId]
    );

    res.json(notifications);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des notifications" });
  }
});

// Route pour déclencher manuellement les rappels
app.get("/api/notifications/send-reminders", async (req, res) => {
  try {
    await sendEarlyBirdReminders();
    res.json({ message: "Rappels Early Bird déclenchés manuellement" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors du déclenchement des rappels" });
  }
});

// Logique pour envoyer des rappels automatiques
const sendEarlyBirdReminders = async () => {
  console.log("Début de sendEarlyBirdReminders:", new Date().toISOString());
  try {
    // Récupérer tous les créateurs Early Bird qui n'ont pas encore rempli les conditions
    const [creators] = await pool.query(
      "SELECT c.id, c.joinedAt, cc.conditionsMet FROM creators c JOIN creator_conditions cc ON c.id = cc.creatorId WHERE c.isEarlyBird = 1 AND cc.conditionsMet = 0"
    );

    console.log("Créateurs trouvés:", creators.length);

    if (creators.length === 0) {
      console.log("Aucun créateur Early Bird éligible trouvé.");
      return;
    }

    const now = new Date();
    console.log("Date actuelle:", now.toISOString());

    for (const creator of creators) {
      const joinDate = new Date(creator.joinedAt);
      console.log(
        `Créateur ${creator.id} - Date d'inscription:`,
        joinDate.toISOString()
      );

      const daysSinceJoin = (now - joinDate) / (1000 * 60 * 60 * 24); // Convertir en jours
      const daysRemaining = Math.max(0, 10 - Math.floor(daysSinceJoin));
      console.log(
        `Créateur ${creator.id} - Jours depuis l'inscription:`,
        daysSinceJoin,
        "Jours restants:",
        daysRemaining
      );

      if (daysSinceJoin <= 10) {
        // Envoyer un rappel quotidien
        const message = `Rappel : Il te reste ${daysRemaining} jour${
          daysRemaining !== 1 ? "s" : ""
        } pour remplir les conditions Early Bird (1 post, 3 vidéos gratuites, 3 vidéos premium) et bénéficier de ton bonus !`;
        await pool.query(
          "INSERT INTO notifications (creatorId, message) VALUES (?, ?)",
          [creator.id, message]
        );
        console.log(`Notification envoyée à ${creator.id}:`, message);
      } else {
        // Envoyer une notification finale si la période est dépassée
        const message =
          "Délai dépassé : Tu n'as pas rempli les conditions Early Bird dans les 10 jours. Ton bonus est maintenant de 70 %.";
        await pool.query(
          "INSERT INTO notifications (creatorId, message) VALUES (?, ?)",
          [creator.id, message]
        );
        console.log(`Notification finale envoyée à ${creator.id}:`, message);
      }
    }
  } catch (error) {
    console.error("Erreur lors de l'envoi des rappels Early Bird:", error);
  }
  console.log("Fin de sendEarlyBirdReminders:", new Date().toISOString());
};

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Erreur serveur" });
});

// Exporter l'application pour Vercel
module.exports = app;
