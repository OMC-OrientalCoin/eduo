const { parentPort } = require('worker_threads');
const { creatTreeModel } = require('../utils/treeHelper')
const Worker = require('worker-threads-promise');

Worker.connect(parentPort);
 
// parentPort.on('message', data => { //you can use await too
//   return new Promise(resolve => {
//     setTimeout(() => {
//       resolve(data);
//     }, data);
//   });
// });

parentPort.on('message', async (users) => {
  global.root = creatTreeModel(users)
})