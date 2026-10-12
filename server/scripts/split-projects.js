const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../routes/projects.routes.js');
const content = fs.readFileSync(srcPath, 'utf8');

// Lines array
const lines = content.split(/\r?\n/);

function getSlice(start1Based, end1Based) {
  return lines.slice(start1Based - 1, end1Based).join('\n');
}

const targetDir = path.join(__dirname, '../routes/projects');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 1. Kanban: 196 to 307
const kanbanContent = `const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

${getSlice(196, 307)}

module.exports = router;
`;
fs.writeFileSync(path.join(targetDir, 'projects.kanban.routes.js'), kanbanContent, 'utf8');

// 2. Meetings: 372 to 643 and 714 to 745
const meetingsContent = `const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { createGoogleMeetEvent } = require('../../utils/googleCalendar');

const router = express.Router();

${getSlice(372, 643)}

${getSlice(714, 745)}

module.exports = router;
`;
fs.writeFileSync(path.join(targetDir, 'projects.meetings.routes.js'), meetingsContent, 'utf8');

// 3. Files: 11 to 45 (storage & getFileCategory) and 747 to 1050
const filesContent = `const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

${getSlice(11, 45)}

${getSlice(747, 1050)}

module.exports = router;
`;
fs.writeFileSync(path.join(targetDir, 'projects.files.routes.js'), filesContent, 'utf8');

// 4. GitHub: 1051 to 2152
const githubContent = `const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

${getSlice(1051, 2152)}

module.exports = router;
`;
fs.writeFileSync(path.join(targetDir, 'projects.github.routes.js'), githubContent, 'utf8');

// 5. Canvas: 2153 to 2304
const canvasContent = `const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

${getSlice(2153, 2304)}

module.exports = router;
`;
fs.writeFileSync(path.join(targetDir, 'projects.canvas.routes.js'), canvasContent, 'utf8');

// 6. Core: 47 to 195 (CRUD & Channels), 309 to 371 (Invitations), and 644 to 713 (Delete workspace & channel)
const coreContent = `const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

${getSlice(47, 195)}

${getSlice(309, 371)}

${getSlice(644, 713)}

module.exports = router;
`;
fs.writeFileSync(path.join(targetDir, 'projects.core.routes.js'), coreContent, 'utf8');

// 7. Master Router
const masterRouterContent = `const express = require('express');
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
`;
fs.writeFileSync(srcPath, masterRouterContent, 'utf8');

console.log('Successfully modularized projects.routes.js into 6 clean sub-routers!');
