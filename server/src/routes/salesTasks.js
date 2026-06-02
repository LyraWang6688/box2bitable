const express = require('express');
const router = express.Router();
const salesTaskController = require('../controllers/salesTaskController');
const { upload } = require('../utils/upload');

router.post('/', upload.single('image'), salesTaskController.createTask);
router.get('/', salesTaskController.listTasks);
router.get('/:task_id', salesTaskController.getTask);
router.post('/:task_id/review', salesTaskController.reviewTask);

module.exports = router;
