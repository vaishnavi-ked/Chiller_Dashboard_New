const express = require('express');
const todos = require("./todos");
const bodyParser = require('body-parser');

const router = express.Router();

router.get("/", function(req, res) {
  res.send("Welcome to the Webhooks API");
});

router.post("/okta-webhooks-endpoint", function(req, res) {
  console.log(req.body);
  res.send("Okta Event hook Successfully received");
});

// router.post("/stripe-webhooks-endpoint", bodyParser.raw({type: 'application/json'}), function(req, res) {
//   console.log(req.body);
//   res.json({ message: 'Hello World' });
//   res.send("Stripe Successfully received Webhook request");
// });
// router.use(require('body-parser').urlencoded({extended: true}));
router.post('/stripe-webhooks-endpoint',bodyParser.raw({type: 'application/json'}), function(req, res) {
  // res.render(__dirname + "404.html", req.body);
    console.log(req.body);  
    // var x = JSON.stringify(req.body.values);
    res.send(req.body);
  });

router.post("/shopify-webhooks-endpoint", function(req, res) {
  console.log(req.body);
  res.send("Shopify Successfully received Webhook request");
});

router.get("/todos", function(req, res) {
  res.json(todos);
});

module.exports = router;
