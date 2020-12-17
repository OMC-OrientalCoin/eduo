module.exports = {
    initCommonMiddleware: function (app) {
        app.use(require('./hbs')(app));
        app.use(require('./responses'));
    },
    auth: require('./auth'),
    // 用户钱包过滤
    walletStatusFilter: (req, resp, next) => {
        if (req.session && req.session.user && req.session.user.walletStatus === 'enabled') {
            next();
        } else {
            resp.failed('用户钱包被禁用，联系管理员');
        }
    }
}