const jwt = require("jsonwebtoken");

const checkToken = (req, res, next) => {
  const token = req.cookies[process.env.COOKIE_NAME];
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      req.isAuthenticated = true;
    } catch (err) {
      req.isAuthenticated = false;
    }
  } else {
    req.isAuthenticated = false;
  }
  next();
};

module.exports = checkToken;
