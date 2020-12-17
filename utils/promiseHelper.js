/*
 * promiseHelper.js
 *
 * Distributed under terms of the MIT license.
 */
const path = require('path');
const config = require('../config');
const fs = require('fs')
const {
  mkdirp,
  getDeletedPath,
  rename,
  getAbsolutePath,
  getDeletedPath4Database,
} = require('./common');
const { compose, compact, map } = require('lodash/fp');
const Jimp = require('jimp');
const sleep = require('sleep-promise')
const mimeType = require('mime-types');

const promiseHelper = {

  getDeleteAndRenamePromises: (pictures, operator) => {
    const renamePromises = [];
    const timestamp = new Date().getTime().toString();
    const deletePromises = pictures.map(picture => {
      const picturePath = picture.path;
      const deletedPath = getDeletedPath(picturePath, timestamp);
      mkdirp(path.parse(deletedPath).dir);
      renamePromises.push(rename(getAbsolutePath(picturePath), deletedPath));
      return picture.update({
        path: getDeletedPath4Database(picturePath, timestamp),
        active: false,
        operator: operator,
      });
    });
    return [...renamePromises, ...deletePromises];
  },

  // 当前用户是否在白名单中
  inWhiteList: (user, whiteList) => {
    return new Promise((resolve, reject) => {
      if (whiteList.indexOf(user) >= 0) {
        resolve();
      }
      reject();
    });
  },

  throwFailedMessage: (str) => {
    return new Promise((resolve, reject) => reject(str));
  },

  throwSuccessPromise: () => {
    return new Promise(resolve => resolve());
  },

  convertImgToBase64: (path) => {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, data) => {
        if (err) {
          reject(err)
        } else {
          let base64Image = new Buffer(data, 'binary').toString('base64');
          resolve(base64Image)
        }
      })
    })
  },

  findOne: (id, schema, absentMsg) => {
    const handleAbsent = (obj) => {
      return !obj ? promiseHelper.throwFailedMessage(absentMsg) : obj;
    }
    if (typeof id === 'object') {
      return schema.findOne(id).then(handleAbsent);
    } else {
      return schema.findById(id).then(handleAbsent);
    }
  },

  saveAll: (records) => {
    return Promise.all(compose(map(record => record.save()), compact)(records));
  },

  deleteAll: (records) => {
    return Promise.all(compose(map(record => record.remove()), compact)(records));
},

  resizePicture: (absolutePath, size) => {
    const pathParser = path.parse(absolutePath);
    const baseName = pathParser.name;
    const postfix = pathParser.ext;
    size = size || 180;
    const newPath = `${pathParser.dir}/${baseName}_${size}${postfix}`;
    return Jimp.read(absolutePath).then(pic => {
      return pic.resize(Jimp.AUTO, size).write(newPath);
    }).then(() => {
      return newPath;
    }).catch(err => {

    })
  },

  getBase64: (filePath) => {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
        }else {
          data = new Buffer(data).toString('base64');
          let base64 = `data:${mimeType.lookup(filePath)};base64,${data}`;
          resolve(base64);
        }
      })
    })
  },

  destoryFile: (filePath) => {
    return new Promise((resolve, reject) => {
      fs.unlink(filePath, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      })
    })
  },

  writeFile: (filePath, data) => {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, (err) => {
        if(err) {
          reject(err);
        }
        resolve(filePath);
      })
    })
  },

  clearOwnership: function (blockId, model) {
    model.findById(blockId).then(block => {
      block.belongingUser = null;
      block.expireDate = null;
      return block.save();
    })
  },

  asyncHandler: function(fn) {
    return function(req, resp, next) {
      return Promise.resolve(fn(req, resp, next)).catch(next);
    }
  },
  asyncHandlerWs: function(fn) {
    return function(ws, req) {
      return Promise.resolve(fn(ws, req)).catch(next);
    }
  },

  /**
   * 重试三次，30s重传
   */
  repeatRequest: async function repeatRequest (requestfn, failedFn, { count = 0, inteval = 30000 }) {
    try {
      return await requestfn()
    }catch(err) {
      if(count !== config.retryTimes) {
        await sleep(inteval)
        return await promiseHelper.repeatRequest(requestfn, failedFn, { count: count + 1, inteval })
      }else if(count === config.retryTimes){
        // throw '请求超时'
        return await failedFn()
      }else {
        throw err
      }
    }
  }


}

module.exports = promiseHelper;
