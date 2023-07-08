const express = require("express");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let database;
const app = express();
app.use(express.json());

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, "twitterClone.db"),
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Database error: ${error.message}`);
  }
};

initializeDBandServer();

// api1
app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `SELECT username FROM user WHERE username='${username}';`;
  const dbUser = await database.get(checkUser);

  if (dbUser !== undefined) {
    response.status(400).send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400).send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `
        INSERT INTO user(name, username, password, gender)
        VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');
      `;
      await database.run(requestQuery);
      response.status(200).send("User created successfully");
    }
  }
});

// api2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUserExist = await database.get(checkUser);

  if (dbUserExist !== undefined) {
    const checkPassword = await bcrypt.compare(password, dbUserExist.password);
    if (checkPassword) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secret_key");
      response.send({ jwtToken });
    } else {
      response.status(400).send("Invalid password");
    }
  } else {
    response.status(400).send("Invalid user");
  }
});

// authentication jwt token
const authenticationToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    const jwtToken = authHeader.split(" ")[1];
    if (jwtToken) {
      jwt.verify(jwtToken, "secret_key", (error, payload) => {
        if (error) {
          response.status(401).send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    } else {
      response.status(401).send("Invalid JWT Token");
    }
  } else {
    response.status(401).send("Invalid JWT Token");
  }
};

// api3
app.get("/user/tweets/feed", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getFollowerIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};
  `;
  const getFollowerIds = await database.all(getFollowerIdsQuery);

  const followerIds = getFollowerIds.map(
    (follower) => follower.following_user_id
  );

  const getTweetQuery = `
    SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM user
    INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${followerIds.join(",")})
    ORDER BY tweet.date_time DESC
    LIMIT 4;
  `;

  const responseResult = await database.all(getTweetQuery);
  response.send(responseResult);
});

// api4
app.get("/user/following", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower
    WHERE follower_user_id=${getUserId.user_id};
  `;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  const getFollowingIds = getFollowingIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getFollowingResultQuery = `
    SELECT name FROM user WHERE user_id IN (${getFollowingIds});
  `;

  const responseResult = await database.all(getFollowingResultQuery);
  response.send(responseResult);
});

// api5
app.get("/user/followers", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getFollowerIdsQuery = `
    SELECT follower_user_id FROM follower WHERE following_user_id=${getUserId.user_id};
  `;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });

  const getFollowersResultQuery = `
    SELECT name FROM user WHERE user_id IN (${getFollowerIds});
  `;

  const responseResult = await database.all(getFollowersResultQuery);
  response.send(responseResult);
});

// api6
app.get("/tweets/:tweetId", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};
  `;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });

  if (getFollowingIds.includes(parseInt(tweetId))) {
    const likesCountQuery = `SELECT COUNT(user_id) AS likes FROM "like" WHERE tweet_id=${tweetId};`;
    const likesCount = await database.get(likesCountQuery);

    const replyCountQuery = `SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id=${tweetId};`;
    const replyCount = await database.get(replyCountQuery);

    const tweetDataQuery = `SELECT tweet, date_time FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetData = await database.get(tweetDataQuery);

    const api6Output = {
      tweet: tweetData.tweet,
      likes: likesCount.likes,
      replies: replyCount.replies,
      dateTime: tweetData.date_time,
    };

    response.send(api6Output);
  } else {
    response.status(401).send("Invalid Request");
  }
});

// api7
app.get(
  "/tweets/:tweetId/likes",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);

    const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};
  `;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });

    const getTweetIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds});
  `;
    const getTweetIdsArray = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const likedUsersQuery = `
      SELECT user.username AS likes
      FROM user
      INNER JOIN "like" ON user.user_id = "like".user_id
      WHERE "like".tweet_id = ${tweetId};
    `;
      const likedUsersArray = await database.all(likedUsersQuery);
      const likedUsers = likedUsersArray.map((eachUser) => {
        return eachUser.likes;
      });

      const api7Output = {
        likes: likedUsers,
      };

      response.send(api7Output);
    } else {
      response.status(401).send("Invalid Request");
    }
  }
);

// api8
app.get(
  "/tweets/:tweetId/replies",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);

    const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};
  `;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });

    if (getFollowingIds.includes(parseInt(tweetId))) {
      const getRepliesQuery = `
      SELECT user.name, reply.reply
      FROM reply
      INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ${tweetId};
    `;
      const replies = await database.all(getRepliesQuery);

      const api8Output = {
        replies: replies.map((reply) => ({
          name: reply.name,
          reply: reply.reply,
        })),
      };

      response.send(api8Output);
    } else {
      response.status(401).send("Invalid Request");
    }
  }
);

// api9
app.get("/user/tweets", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getTweetsQuery = `
    SELECT tweet.tweet, COUNT(DISTINCT "like".user_id) AS likes, COUNT(DISTINCT reply.user_id) AS replies, tweet.date_time AS dateTime
    FROM tweet
    LEFT JOIN "like" ON tweet.tweet_id = "like".tweet_id
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${getUserId.user_id}
    GROUP BY tweet.tweet_id
    ORDER BY tweet.date_time DESC;
  `;

  const responseResult = await database.all(getTweetsQuery);
  response.send(responseResult);
});

// api10
app.post("/user/tweets", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const insertTweetQuery = `
    INSERT INTO tweet(tweet, user_id, date_time)
    VALUES ('${tweet}', ${getUserId.user_id}, datetime('now'));
  `;
  await database.run(insertTweetQuery);

  response.send("Created a Tweet");
});

// api11
app.delete(
  "/tweets/:tweetId",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);

    const checkOwnershipQuery = `
    SELECT user_id FROM tweet WHERE tweet_id=${tweetId};
  `;
    const tweetOwnerId = await database.get(checkOwnershipQuery);

    if (tweetOwnerId.user_id !== getUserId.user_id) {
      response.status(401).send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
