class OrderWsController {
  static async subscribeNewOrder(ws, req) {
    ws.send('连接成功')
    ws.route = req.route.path
    ws.params = req.params
  }
}

module.exports = OrderWsController