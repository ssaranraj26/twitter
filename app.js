const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const databasePath = path.join(__dirname, "twitterClone.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticationToken = async (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const query = `SELECT *
  FROM user
  WHERE username = '${username}'`;
  const dbData = await db.get(query);
  if (dbData !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPass = await bcrypt.hash(password, 10);
      const query = `
          INSERT INTO user(username, password, name, gender)
          VALUES('${username}', '${hashedPass}', '${name}', '${gender}')`;
      await db.run(query);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const query = `SELECT *
    FROM user
    WHERE username = '${username}'`;
  const dbData = await db.get(query);
  if (dbData === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passMatch = await bcrypt.compare(password, dbData.password);
    if (passMatch === true) {
      const payload = {
        username: username,
      };
      const jwtToken = await jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const query = `
    SELECT username,tweet,date_time as dateTime
    FROM user
    INNER JOIN follower ON user.user_id= follower.follower_user_id
    INNER JOIN tweet ON tweet.user_id = user.user_id
    WHERE user.user_id IN (SELECT following_user_id
    FROM user
    INNER JOIN follower ON user.user_id= follower.follower_user_id
    WHERE username='${username}')
    ORDER BY date_time DESC
    LIMIT 4`;
    const dbData = await db.all(query);
    response.send(dbData);
  }
);
// app.get("/follow/", authenticationToken, async (request, response) => {
//   const { username } = request;
//   const query = `
//     SELECT *
//     FROM user
//     INNER JOIN follower ON user.user_id= follower.follower_user_id
//     `;
//   const q2 = `SELECT *
//     FROM tweet
//     WHERE user_id='${2}'`;
//   const dbData = await db.all(q2);
//   response.send(dbData);
// });

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const query = `;
      SELECT DISTINCT(name)
      FROM user
      WHERE user_id IN (SELECT following_user_id
      FROM user
      INNER JOIN follower ON user.user_id= follower.follower_user_id
      WHERE username='${username}')`;
  const dbData = await db.all(query);
  response.send(dbData);
  console.log(dbData);
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const query = `;
      SELECT DISTINCT(name)
      FROM user
      WHERE user_id IN (SELECT follower_id
      FROM user
      INNER JOIN follower ON user.user_id= follower.follower_user_id
      WHERE username='${username}')`;
  const dbData = await db.all(query);
  response.send(dbData);
});

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const dbQuery = `SELECT *
      FROM tweet
      WHERE tweet_id = ${tweetId}
      AND user_id IN (SELECT following_user_id
      FROM user
      INNER JOIN follower ON user.user_id= follower.follower_user_id
      WHERE user.username='${username}')`;
  const sj = await db.get(dbQuery);
  if (sj === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const query = `
    SELECT tweet,
    SUM(like_id) as likes,
    SUM(reply_id) as replies,
    date_time as dateTime
    FROM tweet
    INNER JOIN like ON like.tweet_id=tweet.tweet_id
    INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE tweet.tweet_id = '${tweetId}'
    AND tweet.user_id IN (SELECT following_user_id
      FROM user
      INNER JOIN follower ON user.user_id= follower.follower_user_id
      WHERE user.username='${username}')`;
    const dbData = await db.get(query);
    response.send(dbData);
  }
});

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const query = `;
    SELECT tweet,
    SUM(like_id) as likes,
    SUM(reply_id) as replies,
    date_time as dateTime
    FROM tweet
    INNER JOIN user ON user.user_id = tweet.user_id
    INNER JOIN like ON like.tweet_id=tweet.tweet_id
    INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE username='${username}'
    GROUP BY tweet.tweet_id`;
  const dbData = await db.all(query);
  response.send(dbData);
});

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const query = `
    INSERT INTO tweet(tweet)
    VALUES('${tweet}')`;
  const dbData = await db.run(query);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const query = `
        SELECT *
        FROM tweet
        WHERE tweet_id IN (SELECT tweet_id
        FROM tweet
        INNER JOIN user ON user.user_id= tweet.user_id
        WHERE username = '${username}')`;
    const twt = await db.get(query);
    console.log(twt);
    if (twt !== undefined) {
      const qry = `DELETE FROM tweet
    WHERE tweet_id = ${tweetId}`;
      await db.run(qry);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
