const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

// Initialize Firebase Admin SDK
const serviceAccount = require("../dj-seo-dashboard-firebase-adminsdk-fbsvc-2c9cdb2f68.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dj-seo-dashboard.firebaseio.com",
});

const db = admin.firestore();
const app = express();
const PORT = 8009;

app.use(bodyParser.json());
app.use(cors());

/**
 * Admin Login (Firebase Auth)
 */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const userRef = db.collection("users").doc(userRecord.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists)
      return res.status(404).json({ message: "User not found in database" });

    res.status(200).json({
      message: "Login successful",
      uid: userRecord.uid,
      role: userDoc.data().role,
    });
  } catch (error) {
    res
      .status(401)
      .json({ message: "Invalid email or password", error: error.message });
  }
});

/**
 * Admin: Create New Admin
 */
app.post("/register-admin", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const userRecord = await admin
      .auth()
      .createUser({ email, password, displayName: name });
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role: "admin",
      createdAt: new Date().toISOString(),
    });

    res
      .status(201)
      .json({ message: "Admin registered successfully", uid: userRecord.uid });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating admin", error: error.message });
  }
});

/**
 * Admin: Create New Client User
 */
app.post("/create-user", async (req, res) => {
  const { name, email, password, projectName, projectStatus } = req.body;
  if (!name || !email || !password || !projectName || !projectStatus)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const userRecord = await admin
      .auth()
      .createUser({ email, password, displayName: name });
    await db
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name,
        email,
        role: "client",
        projectName,
        projectStatus: projectStatus || "on-going",
        createdAt: new Date().toISOString(),
      });

    res
      .status(201)
      .json({ message: "Client created successfully", uid: userRecord.uid });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
});

// Login route for clients
app.post("/client-login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const userCredential = await admin.auth().getUserByEmail(email); // Get user by email
    const userRef = db.collection("users").doc(userCredential.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "Client not found in database" });
    }

    res.status(200).json({
      message: "Login successful",
      uid: userCredential.uid,
      role: userDoc.data().role,
    });
  } catch (error) {
    res
      .status(401)
      .json({ message: "Invalid email or password", error: error.message });
  }
});

/**
 * Get All Users (Clients)
 */
app.get("/users", async (req, res) => {
  try {
    const snapshot = await db
      .collection("users")
      .where("role", "==", "client")
      .get();
    if (snapshot.empty)
      return res.status(404).json({ message: "No clients found" });

    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching users", error: error.message });
  }
});

/**
 * Get a Single User (Client)
 */
app.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user", error: error.message });
  }
});

/**
 * Update Project Details (Client)
 */
app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, projectName, projectDetail, projectStatus } = req.body;

  try {
    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User not found" });
    }

    await userRef.update({
      name,
      projectName,
      projectDetail: projectDetail || "",
      projectStatus,
    });

    res.json({ message: "Project updated successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating project", error: error.message });
  }
});

/**
 * Admin: Delete User
 */
app.delete("/users/:id", async (req, res) => {
  try {
    await admin.auth().deleteUser(req.params.id);
    await db.collection("users").doc(req.params.id).delete();
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting user", error: error.message });
  }
});

/**
 * Fetch and Scrape Google Rankings for a Client's Project
 */
const getRanking = async (keyword, siteUrl) => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
  );

  const results = await page.evaluate(() => {
    return [...document.querySelectorAll("div.tF2Cxc a")].map((a) => a.href);
  });

  await browser.close();

  const position = results.findIndex((url) => url.includes(siteUrl)) + 1;
  return position > 0 ? position : "Not found";
};

// Fetch rankings based on new structure
app.get("/scrape-rankings/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch user document
    const userRef = db.collection("users").doc(id);
    const projectRef = userRef.collection("project").doc(id);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return res.status(404).json({ message: "Project not found" });
    }

    const projectData = projectDoc.data();
    const siteUrl = projectData.siteUrl;
    const keywords = projectData.keywords || [];

    if (!siteUrl || keywords.length === 0) {
      return res.status(400).json({ message: "Missing site URL or keywords" });
    }

    // Scrape Google rankings for each keyword
    const rankings = await Promise.all(
      keywords.map(async (keyword) => {
        const position = await getRanking(keyword, siteUrl);
        return { keyword, position };
      })
    );

    // Store rankings in Firestore under the project document
    await projectRef.update({ rankings });

    res.json({ message: "Rankings updated", rankings });
  } catch (error) {
    console.error("Error fetching rankings:", error);
    res
      .status(500)
      .json({ message: "Error fetching rankings", error: error.message });
  }
});

/**
 * Get Rankings for a Client Project
 */
app.get("/rankings/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const userRef = db.collection("users").doc(id);
    const projectRef = userRef.collection("project").doc(id);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      return res.status(404).json({ message: "Project not found" });
    }

    const rankings = projectDoc.data().rankings || [];
    res.json({ rankings });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching rankings", error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
