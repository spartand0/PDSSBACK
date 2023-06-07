const jwt = require('jsonwebtoken');
const JwksRsa = require('jwks-rsa');
const { getChildById } = require('../../services/child.service');
const { getUserBySUB } = require('../../services/user.service');

const verifyToken = async (token) => {
  const client = JwksRsa({
    jwksUri: `https://${process.env.AUTH0_CLIENT_DOMAIN}/.well-known/jwks.json`,
    cache: false,
    rateLimit: false,
    jwksRequestsPerMinute: 50
  });

  const childIssuerKeys = await client.getKeys(token);
  const secretKey = await client.getSigningKey(childIssuerKeys[0].kid);
  
  return jwt.verify(token, secretKey.getPublicKey(), {
    audience: process.env.AUTH0_API_AUDIENCE,
    issuer: `https://${process.env.AUTH0_CLIENT_DOMAIN}/`,
    algorithms: ['RS256']
  });
};

exports.userAccessList = async (req, res, next) => {
  try {
    if (!req.params || !req.headers.authorization) {
      return res.status(403).json({
        date: Date.now(),
        success: false,
        status: 403,
        description: 'Error occurred, please login again!',
        data: null
      });
    }

    const { userId } = req.params;
    const token = req.headers.authorization.split(' ')[1];

    const decoded = await verifyToken(token);
    const user = await getUserBySUB(decoded.sub);

    if (user[0][0].id == userId) {
      return next();
    }

    return res.status(403).json({
      date: Date.now(),
      success: false,
      status: 403,
      description: 'You are not allowed to access this information.',
      data: null
    });
  } catch (error) {
    return res.status(500).json({
      date: Date.now(),
      success: false,
      status: 500,
      description: 'Fatal error, source userAccessList middleware!',
      data: null
    });
  }
};

exports.userChildAccess = async (req, res, next) => {
  try {
    if (!req.params || !req.headers.authorization) {
      return res.status(403).json({
        date: Date.now(),
        success: false,
        status: 403,
        description: 'Error occurred, please login again!',
        data: null
      });
    }

    const { childId } = req.params;
    const token = req.headers.authorization.split(' ')[1];

    const decoded = await verifyToken(token);
    const user = await getUserBySUB(decoded.sub);
    const child = await getChildById(childId);

    if (child[0].user == user[0][0].id) {
      return next();
    }

    return res.status(403).json({
      date: Date.now(),
      success: false,
      status: 403,
      description: 'You are not allowed to access this information.',
      data: null
    });
  } catch (error) {
    return res.status(500).json({
      date: Date.now(),
      success: false,
      status: 500,
      description: 'Fatal error, source userChildAccess middleware!',
      data: null
    });
  }
};
