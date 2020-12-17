const notSuperAdmin = (user, field) => {
  return user.authGroup[field] !== 'superAdmin';
}
const notNull = (user, field) => {
  return user.authGroup[field] !== 'null';
}
const notRole = (user, field, role) => {
  return user.authGroup[field] !== role;
}
const accessHanlder = async (session, fn) => {
  const user = session.user
  if (!accessAuth.notRole(user, 'merchant', 'merchantAdmin')
    || !accessAuth.notSuperAdmin(user, 'merchant')) {
    await fn()
  } else {
    throw '没有权限！';
  }
}
const accessAuth = {
  notSuperAdmin,
  notNull,
  notRole,
  // 商户平台普遍操作
  accessHanlder,
  platformAuthAccess: (req, resp, next) => {
    const user = req.session.user;
    if (notSuperAdmin(user, 'platform') && notRole(user, 'platform', 'admin')) {
      resp.failed('权限不足！');
    } else {
      next();
    }
  },
  platformMerchantAccess: (req, resp, next) => {
    const user = req.session.user;
    if (notSuperAdmin(user, 'platform') && notRole(user, 'platform', 'merchantAdmin')) {
      resp.failed('权限不足！');
    } else {
      next();
    }
  },
  // 添加对于特定商户的认证
  merchantMerchantAccess: (req, resp, next) => {
    const user = req.session.user;
    if (notSuperAdmin(user, 'merchant') && notRole(user, 'merchant', 'merchantAdmin')) {
      resp.failed('权限不足！');
    } else {
      next();
    }
  }

}

module.exports = accessAuth;