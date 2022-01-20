import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { default as mongodb } from "mongodb";
import { read } from "fs";
import methodOverride from "method-override";
import passport from "passport";
import LocalStrate from "passport-local";
import session from "express-session";
import bcrypt from "bcrypt"; // Bcrypt를 불러옴
import dotenv from "dotenv";
import multer from "multer";
import { ObjectId } from "mongodb";

dotenv.config();
const saltRounds = 10; // salt 돌리는 횟수

let MongoClient = mongodb.MongoClient;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LocalStrategy = LocalStrate.Strategy;
const app = express();

var db;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(
  session({ secret: "비밀코드", resave: true, saveUninitialized: false })
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(
    {
      usernameField: "id",
      passwordField: "pw",
      session: true,
      passReqToCallback: false,
    },
    function (uid, upd, done) {
      //console.log(입력한아이디, 입력한비번);
      db.collection("login").findOne({ id: uid }, function (err, result) {
        if (err) return done(err);

        if (!result)
          return done(null, false, { message: "존재하지않는 아이디요" });
        if (upd == result.pw) {
          return done(null, result); //serialize로 들어감
        } else {
          return done(null, false, { message: "비번틀렸어요" });
        }
      });
    }
  )
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (아이디, done) {
  db.collection("login").findOne({ id: 아이디 }, function (에러, 결과) {
    done(null, 결과);
  });
});

app.set("view engine", "ejs");

MongoClient.connect(
  process.env.DB_URL,
  { useUnifiedTopology: true },
  function (에러, client) {
    if (에러) return console.log(에러);
    db = client.db("todoapp");

    app.listen(8080, function () {
      console.log("listening on 8080");
    });
  }
);

app.use("/static", express.static("public"));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/image");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname + "날짜" + new Date());
  },
});

let upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/write", (req, res) => {
  res.render("board.ejs");
});

// /list get요청으로 접속하면
//실제 db에 저장된 데이터들 보여줌 html 보여줌

app.get("/list", (req, res) => {
  //디비에 저장된 post 안에 조건이 뭐인 데이터 꺼내기
  db.collection("post")
    .find()
    .toArray((err, result) => {
      res.render("list.ejs", { posts: result });
    });
});

app.delete("/delete", (req, res) => {
  console.log(req.body);
  req.body._id = parseInt(req.body._id);

  let data = { _id: req.body._id, 직성자: req.user._id };
  db.collection("post").deleteOne(data, (err, result) => {
    console.log("삭제완료");
    if (err) console.log(err);
    res.status(200).send({ message: "성공" });
  });
});

app.get("/detail/:id", (req, res) => {
  db.collection("post").findOne(
    { _id: parseInt(req.params.id) },
    (err, result) => {
      if (result) {
        res.render("detail.ejs", { data: result });
      } else {
        res.status(404).send({ message: "에러" });
      }
    }
  );
});

app.get("/edit", (req, res) => {
  res.render("edit.ejs");
});

app.get("/edit/:id", (req, res) => {
  db.collection("post").findOne(
    { _id: parseInt(req.params.id) },
    (err, result) => {
      res.render("edit.ejs", { post: result });
    }
  );
});

app.put("/edit", function (req, res) {
  db.collection("post").updateOne(
    { _id: parseInt(req.body.id) },
    { $set: { 제목: req.body.title, 날짜: req.body.data } },
    function () {
      console.log("수정완료");
      res.redirect("/list");
    }
  );
});

app.get("/login", function (req, res) {
  res.render("login.ejs");
});

app.post(
  "/login",
  passport.authenticate("local", { failureRedirect: "/fail" }),
  function (req, res) {
    res.redirect("/");
  }
);

app.get("/mypage", isLoggined, (req, res) => {
  res.render("mypage.ejs");
});

function isLoggined(req, res, next) {
  if (req.user) {
    next();
  } else {
    res.send("로그인 하세요");
  }
}

app.post("/register", (req, res) => {
  db.collection("login").insertOne(
    { id: req.body.id, pw: req.body.pw },
    function (err, result) {
      res.redirect("/");
    }
  );
});

app.post("/add", (req, res) => {
  db.collection("counter").findOne({ name: "게시판 갯수" }, (err, result) => {
    let boardcount = result.postCounter;
    let savepoint = {
      _id: boardcount + 1,
      작성자: req.user._id,
      제목: req.body.title,
      날짜: req.body.data,
    };
    db.collection("post").insertOne(savepoint, function (err, result) {
      console.log("저장완료");
      let count = 1;

      res.redirect("/list");
      db.collection("counter").updateOne(
        { name: "게시판 갯수" },
        { $inc: { postCounter: 1 } },
        (err, result) => {
          if (err) return console.log(err);
        }
      );
    });
  });
});
app.get("/search", (req, res) => {
  let search = [
    {
      $search: {
        index: "titleSearch",
        text: {
          query: req.query.value,
          path: "제목", // 제목날짜 둘다 찾고 싶으면 ['제목', '날짜']
        },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 10 },
  ];

  db.collection("post")
    .aggregate(search)
    .toArray((err, result) => {
      console.log(result);
      res.render("search.ejs", { posts: result });
    });
});

app.get("/upload", function (req, res) {
  res.render("upload.ejs");
});

app.post("/upload", upload.single("프로필"), (req, res) => {
  res.send("완료");
});

app.post("/chatroom", isLoggined, function (req, res) {
  var 저장할거 = {
    title: "무슨무슨채팅방",
    member: [ObjectId(req.body.suedid), req.user._id],
    date: new Date(),
  };

  db.collection("chat")
    .insertOne(저장할거)
    .then(function (결과) {
      res.send("저장완료");
    });
});

app.get("/chat", isLoggined, function (req, res) {
  db.collection("chat")
    .find({ member: req.user._id })
    .toArray()
    .then((결과) => {
      console.log(결과);
      res.render("chat.ejs", { data: 결과 });
    });
});
