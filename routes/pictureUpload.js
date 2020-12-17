const multer = require('multer');
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const {
  trim,
  toNumber
} = require('lodash');
const {
  PICTURE_DIR
} = require('../commons/respCommons');
const {
  convertImgToBase64,
  resizePicture,
  destoryFile
} = require('../utils/promiseHelper');
const { getHost } = require('../utils/common')

const mkdir = (type, id, cb) => {
  const picturePath = path.resolve(__dirname, `../${PICTURE_DIR}${type}/${id}/`);
  if (!fs.existsSync(picturePath)) {
    mkdirp(picturePath, () => cb(null, picturePath));
  } else {
    cb(null, picturePath);
  }
}

const handleUploadSuccess = (req, resp, next) => {
  const savedPath = req.file.path;
  const height = toNumber(req.params.height);
  if (height) {
    resizePicture(savedPath, height).then(newPath => {
      const url = `${getHost(req)}/public/${newPath.slice(newPath.indexOf('pic')).replace(/\\/g, '/')}`;
      resp.json({
        result: 0,
        message: '上传成功！',
        data: {
          url: url,
        }
      })
      return destoryFile(savedPath);
    })
  } else {
    const url = `${getHost(req)}/public/${savedPath.slice(savedPath.indexOf('pic')).replace(/\\/g, '/')}`;
    resp.json({
      result: 0,
      message: '上传成功！',
      data: {
        url: url,
      }
    })
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const model = req.params.model;
    const instanceId = trim(req.params.instanceId);
    mkdir(`${model}`, instanceId, cb);
  },
  filename: (req, file, cb) => {
    cb(null, (file.originalname.replace(/,/g, '')));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.indexOf('image/') === 0) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};
const picUpload = multer({
  storage: storage,
  fileFilter: fileFilter
});

router.post('/:model/upload/:instanceId/:height', picUpload.single('file'), handleUploadSuccess)
router.post('/:model/upload/:instanceId', picUpload.single('file'), handleUploadSuccess)

module.exports = router;