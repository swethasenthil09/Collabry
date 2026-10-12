const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedRichDemo() {
  console.log('🌱 Starting Collabry Rich Seed Data Insertion...');

  try {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Insert Demo Users
    const users = [
      {
        username: 'alex_dev',
        email: 'alex@collabry.dev',
        name: 'Alex Rivers',
        alias: 'CyberHawk42',
        bio: 'Fullstack Architect & Systems Designer. Obsessed with high-performance real-time applications.',
        skills: ['React', 'TypeScript', 'Node.js', 'GraphQL', 'Docker'],
      },
      {
        username: 'sophia_ui',
        email: 'sophia@collabry.dev',
        name: 'Sophia Chen',
        alias: 'PixelSage99',
        bio: 'Senior UI/UX Product Designer & Frontend Engineer. Crafting sleek dark interfaces.',
        skills: ['Figma', 'CSS/Sass', 'React', 'Design Systems', 'Micro-interactions'],
      },
      {
        username: 'marcus_ai',
        email: 'marcus@collabry.dev',
        name: 'Marcus Vance',
        alias: 'QuantumWolf17',
        bio: 'AI Systems Engineer working on LLM agents, MCP servers, and autonomous workflows.',
        skills: ['Python', 'FastAPI', 'PyTorch', 'LangChain', 'PostgreSQL'],
      },
      {
        username: 'elena_rust',
        email: 'elena@collabry.dev',
        name: 'Elena Rostova',
        alias: 'SteadyKnight8',
        bio: 'Rustacean & distributed systems researcher. Building WebAssembly pipelines.',
        skills: ['Rust', 'WebAssembly', 'gRPC', 'Redis', 'WebSockets'],
      },
    ];

    const userMap = {};

    for (const u of users) {
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ? OR email = ?', [u.username, u.email]);
      let userId;
      if (existing.length > 0) {
        userId = existing[0].id;
        await pool.query(
          'UPDATE users SET name = ?, alias = ?, bio = ?, password_hash = ? WHERE id = ?',
          [u.name, u.alias, u.bio, passwordHash, userId]
        );
      } else {
        const [res] = await pool.query(
          'INSERT INTO users (username, email, password_hash, name, alias, bio) VALUES (?, ?, ?, ?, ?, ?)',
          [u.username, u.email, passwordHash, u.name, u.alias, u.bio]
        );
        userId = res.insertId;
      }
      userMap[u.username] = userId;

      // Add skills
      await pool.query('DELETE FROM user_skills WHERE user_id = ?', [userId]);
      for (const skill of u.skills) {
        await pool.query('INSERT IGNORE INTO user_skills (user_id, skill) VALUES (?, ?)', [userId, skill]);
      }
    }
    console.log('✅ Demo Users & Skills Seeded (Password: Password123!)');

    // 2. Insert Communities
    const communities = [
      {
        name: 'Fullstack Developers',
        slug: 'fullstack-devs',
        description: 'Modern fullstack architecture, React 19, Node.js, distributed databases & scaling best practices.',
      },
      {
        name: 'AI Agents & LLMs',
        slug: 'ai-agents',
        description: 'Building autonomous agents, Model Context Protocol (MCP), fine-tuning, and multi-agent coordination.',
      },
      {
        name: 'UI/UX Design & Frontends',
        slug: 'ui-ux-designers',
        description: 'Design systems, glassmorphism, micro-interactions, responsive CSS layouts, and sleek dark modes.',
      },
      {
        name: 'Indie Hackers & Builders',
        slug: 'indie-hackers',
        description: 'From idea to revenue. Sharing early MVPs, feedback, collaboration opportunities, and tech stacks.',
      },
    ];

    const commMap = {};

    for (const c of communities) {
      const [existing] = await pool.query('SELECT id FROM communities WHERE slug = ?', [c.slug]);
      let commId;
      if (existing.length > 0) {
        commId = existing[0].id;
      } else {
        const [res] = await pool.query(
          'INSERT INTO communities (name, slug, description, creator_id) VALUES (?, ?, ?, ?)',
          [c.name, c.slug, c.description, userMap['alex_dev']]
        );
        commId = res.insertId;
      }
      commMap[c.slug] = commId;

      // Add all demo users as members
      for (const u of users) {
        await pool.query(
          'INSERT IGNORE INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)',
          [commId, userMap[u.username], u.username === 'alex_dev' ? 'owner' : 'member']
        );
      }
    }
    console.log('✅ Demo Communities & Membership Seeded');

    // 3. Insert Posts & Comments
    // Post 1: Collaboration Request in AI Agents
    const [p1] = await pool.query(
      `INSERT INTO posts (community_id, author_id, title, body, post_type, identity_mode, required_skills, team_size, collab_status, upvotes)
       VALUES (?, ?, ?, ?, 'collaboration_request', 'public', ?, 3, 'open', 14)`,
      [
        commMap['ai-agents'],
        userMap['marcus_ai'],
        'Building an Autonomous AI Agent Pair-Programmer with MCP Integration',
        'Looking for a senior React/UI engineer and a Rust backend dev to build a high-performance developer agent IDE sidecar. We have the agent orchestrator prototype ready and need help building the visual workspace and real-time socket protocol.',
        JSON.stringify(['React', 'TypeScript', 'Rust', 'WebSockets', 'Python']),
      ]
    );
    const post1Id = p1.insertId;

    // Applicants for Post 1
    await pool.query(
      `INSERT INTO post_interests (post_id, user_id, message, skills_offered, status)
       VALUES (?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE message=VALUES(message), status=VALUES(status)`,
      [
        post1Id,
        userMap['sophia_ui'],
        'I would love to design and implement the IDE canvas UI and interactive agent timeline!',
        JSON.stringify(['React', 'Figma', 'CSS/Sass']),
      ]
    );

    await pool.query(
      `INSERT INTO post_interests (post_id, user_id, message, skills_offered, status)
       VALUES (?, ?, ?, ?, 'accepted')
       ON DUPLICATE KEY UPDATE message=VALUES(message), status=VALUES(status)`,
      [
        post1Id,
        userMap['elena_rust'],
        'I can build the zero-overhead Rust WebSocket daemon and IPC transport layer.',
        JSON.stringify(['Rust', 'WebAssembly', 'WebSockets']),
      ]
    );

    // Comments for Post 1
    const [c1] = await pool.query(
      `INSERT INTO comments (post_id, author_id, body, identity_mode, upvotes)
       VALUES (?, ?, ?, 'public', 5)`,
      [post1Id, userMap['alex_dev'], 'This sounds like an incredible project! Are you planning to support local Ollama models too?']
    );
    await pool.query(
      `INSERT INTO comments (post_id, author_id, parent_comment_id, body, identity_mode, depth, upvotes)
       VALUES (?, ?, ?, ?, 'public', 1, 3)`,
      [post1Id, userMap['marcus_ai'], c1.insertId, 'Yes! We have an abstraction for both cloud Claude/Gemini endpoints and local Ollama instances.']
    );

    // Post 2: Design Philosophy in UI/UX
    const [p2] = await pool.query(
      `INSERT INTO posts (community_id, author_id, title, body, post_type, identity_mode, upvotes)
       VALUES (?, ?, ?, ?, 'discussion', 'public', 28)`,
      [
        commMap['ui-ux-designers'],
        userMap['sophia_ui'],
        'Why Discord-Style Dark Mode & Subtle Glassmorphism Create the Most Engaging Developer Tools',
        'When designing tools for developers who spend 10+ hours a day in front of screens, color contrast and visual hierarchy make all the difference. In Collabry, we chose deep navy backgrounds (`#2b2d31`, `#1e1f22`) with Blurple accents (`#5865F2`). What are your favorite color palettes for developer tools?',
      ]
    );
    await pool.query(
      `INSERT INTO comments (post_id, author_id, body, identity_mode, upvotes)
       VALUES (?, ?, ?, 'alias', 8)`,
      [p2.insertId, userMap['elena_rust'], 'Deep obsidian dark themes with high-contrast pastel accents definitely reduce eye fatigue during late-night debugging.']
    );

    console.log('✅ Demo Discussions, Collaboration Pitches & Comments Seeded');

    // 4. Insert Demo Project Workspace
    const [projRes] = await pool.query(
      `INSERT INTO projects (name, description, creator_id, status)
       VALUES (?, ?, ?, 'active')`,
      [
        'Autonomous Agent IDE Workspace',
        'Real-time collaborative developer workspace for building our AI pair-programming assistant.',
        userMap['marcus_ai'],
      ]
    );
    const projectId = projRes.insertId;

    // Add members to project
    await pool.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, role)
       VALUES (?, ?, 'owner'), (?, ?, 'admin'), (?, ?, 'member')`,
      [
        projectId, userMap['marcus_ai'],
        projectId, userMap['elena_rust'],
        projectId, userMap['sophia_ui'],
      ]
    );

    // Create Discord-style text channels
    const channels = ['general', 'architecture', 'ui-mockups', 'dev-ops'];
    const channelIds = {};

    for (const ch of channels) {
      const [chRes] = await pool.query(
        "INSERT INTO conversations (project_id, name, type) VALUES (?, ?, 'channel')",
        [projectId, ch]
      );
      channelIds[ch] = chRes.insertId;

      // Add project members to conversation members
      await pool.query(
        `INSERT IGNORE INTO conversation_members (conversation_id, user_id)
         VALUES (?, ?), (?, ?), (?, ?)`,
        [
          chRes.insertId, userMap['marcus_ai'],
          chRes.insertId, userMap['elena_rust'],
          chRes.insertId, userMap['sophia_ui'],
        ]
      );
    }

    // Add messages to #general channel
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES 
       (?, ?, 'Welcome to the Autonomous Agent project workspace! 🎉'),
       (?, ?, 'Excited to be here! I have sketched out the initial architecture in the whiteboard.'),
       (?, ?, 'Awesome, I am finalizing the UI design system components in Figma and will link them in #ui-mockups.')`,
      [
        channelIds['general'], userMap['marcus_ai'],
        channelIds['general'], userMap['elena_rust'],
        channelIds['general'], userMap['sophia_ui'],
      ]
    );

    // Add Kanban tasks
    const tasks = [
      {
        title: 'Design high-fidelity sidebar & channel switcher',
        description: 'Implement dark Discord-inspired channel navigator with unread badges.',
        status: 'in_progress',
        priority: 'high',
        assignee_id: userMap['sophia_ui'],
      },
      {
        title: 'Build WebAssembly JSON-RPC protocol parser',
        description: 'High-speed stream deserializer for agent responses.',
        status: 'todo',
        priority: 'urgent',
        assignee_id: userMap['elena_rust'],
      },
      {
        title: 'Setup multi-tenant Socket.io room authentication',
        description: 'JWT handshake verification on WebSocket connect.',
        status: 'done',
        priority: 'medium',
        assignee_id: userMap['marcus_ai'],
      },
      {
        title: 'Add inline code execution sandbox',
        description: 'Isolated worker thread to preview generated snippet output.',
        status: 'todo',
        priority: 'medium',
        assignee_id: null,
      },
    ];

    for (const t of tasks) {
      await pool.query(
        `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, creator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [projectId, t.title, t.description, t.status, t.priority, t.assignee_id, userMap['marcus_ai']]
      );
    }

    console.log('✅ Demo Project Workspace, Channels, Messages & Kanban Board Seeded');

    // 5. Insert 1-on-1 Direct Message conversation
    const [dmRes] = await pool.query("INSERT INTO conversations (type) VALUES ('dm')");
    const dmId = dmRes.insertId;

    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id)
       VALUES (?, ?), (?, ?)`,
      [dmId, userMap['alex_dev'], dmId, userMap['sophia_ui']]
    );

    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES 
       (?, ?, 'Hey Sophia! Loved your recent design post on UI/UX.'),
       (?, ?, 'Thanks Alex! Appreciate the feedback. Let me know if you want to collaborate on the next design system sprint!')`,
      [dmId, userMap['alex_dev'], dmId, userMap['sophia_ui']]
    );

    console.log('✅ Demo Direct Message Conversations Seeded');
    console.log('\n🎉 ALL RICH SEED DATA INSERTED SUCCESSFULLY!');
    console.log('Demo Login Credentials:');
    console.log('  Email: alex@collabry.dev  | Password: Password123!');
    console.log('  Email: sophia@collabry.dev| Password: Password123!');
    console.log('  Email: marcus@collabry.dev| Password: Password123!');
    console.log('  Email: elena@collabry.dev | Password: Password123!\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seedRichDemo();
