const express = require('express');
const router = express.Router();

const coreRoutes = require('./projects/projects.core.routes');
const kanbanRoutes = require('./projects/projects.kanban.routes');
const meetingsRoutes = require('./projects/projects.meetings.routes');
const filesRoutes = require('./projects/projects.files.routes');
const githubRoutes = require('./projects/projects.github.routes');
const canvasRoutes = require('./projects/projects.canvas.routes');

router.use('/', coreRoutes);
router.use('/', kanbanRoutes);
router.use('/', meetingsRoutes);
router.use('/', filesRoutes);
router.use('/', githubRoutes);
router.use('/', canvasRoutes);

module.exports = router;
