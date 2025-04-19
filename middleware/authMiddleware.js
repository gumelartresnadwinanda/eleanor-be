const jwt = require("jsonwebtoken");

const checkToken = (req, res, next) => {
  const token = req.cookies[process.env.COOKIE_NAME];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.isAuthenticated = true;
      req.user = {
        id: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
      };
    } catch (err) {
      req.isAuthenticated = false;
      req.user = null;
    }
  } else {
    req.isAuthenticated = false;
    req.user = null;
  }
  next();
};

module.exports = checkToken;
