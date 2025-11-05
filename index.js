const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
// console.log(process.env);

const serviceAccount = require("./smart-deals--firebase-admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware

app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log("Logging info");
  next();
};

const verifyFireBaseToken = async (req, res, next) => {
  // console.log("Middleware", req.headers.authorigation);
  if (!req.headers.authorigation) {
    return res.status(401).send({ massage: "Unauthorized access" });
  }
  const token = req.headers.authorigation.split(" ")[1];
  if (!token) {
    return res.status(401).send({ massage: "Unauthorized access" });
  }
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.tokenEmail = userInfo.email;
    next();
  } catch {
    return res.status(401).send({ massage: "Unauthorized access" });
  }
};

const verifyJWTToken = (req, res, next) => {
  console.log("IN Middleware", req.headers);
  if (!req.headers.authorigation) {
    return res.status(401).send({ massage: "Unauthorized access" });
  }
  const token = req.headers.authorigation.split(" ")[1];
  if (!token) {
    return res.status(401).send({ massage: "Unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ massage: "Unauthorized access" });
    }
    req.tokenEmail = decoded.email;

    // Put in the right place

    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@sahidul-islam.zbcwnr8.mongodb.net/?appName=Sahidul-Islam`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Smart deals server is running!");
});

async function run() {
  try {
    await client.connect();
    const db = client.db("smart_db");
    const productCollection = db.collection("products");
    const bidsCollection = db.collection("bids");
    const usersCollection = db.collection("users");

    // JWT related API

    app.post("/getToken", (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token: token });
    });

    // USERS API

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({ Message: "User already exist!" });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // PRODUCTS API
    app.get("/products", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = productCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/latest-products", async (req, res) => {
      const cursor = productCollection.find().sort({ created_at: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.post("/products", async (req, res) => {
      const newProduct = req.body;
      const result = await productCollection.insertOne(newProduct);
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updateProduct = req.body;
      const qurey = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updateProduct.name,
          price: updateProduct.price,
        },
      };
      const result = await productCollection.updateOne(qurey, update);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const qurey = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(qurey);
      res.send(result);
    });

    // bids related apis with firebase token verify

    app.get("/bids", verifyJWTToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        if (email !== req.tokenEmail) {
          return res.status(403).send({ massage: "Forbidden access" });
        }
        query.buyer_email = email;
      }
      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // app.get("/bids", logger, verifyFireBaseToken, async (req, res) => {
    //   console.log("headers", req);
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     if (email !== req.tokenEmail) {
    //       return res.status(403).send({ massage: "Forbidden access" });
    //     }
    //     query.buyer_email = email;
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    app.get(
      "/products/bids/:productId",
      verifyFireBaseToken,
      async (req, res) => {
        const productId = req.params.productId;
        const query = { product: productId };
        const cursor = bidsCollection.find(query).sort({
          bid_price: 1,
        });
        const result = await cursor.toArray();
        res.send(result);
      }
    );

    app.get("/bids", async (req, res) => {
      const query = {};
      if (query.email) {
        query.buyer_email = email;
      }
      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // bids post

    app.post("/bids", async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    // bids update

    app.patch("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const updateBids = req.body;
      const qurey = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updateBids.name,
          price: updateBids.price,
        },
      };
      const result = await bidsCollection.updateOne(qurey, update);
      res.send(result);
    });

    // single bid identify
    app.get("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const qurey = { _id: new ObjectId(id) };
      const result = await bidsCollection.findOne(qurey);
      res.send(result);
    });

    // bid delete
    app.delete("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const qurey = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(qurey);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Smart deals server is running on port: ${port}`);
});
