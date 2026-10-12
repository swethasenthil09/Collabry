import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';
import { getSocket, connectSocket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import {
  IconBrush,
  IconSquare,
  IconCircle,
  IconMinus,
  IconStickyNote,
  IconDownload,
  IconUpload,
  IconUndo,
  IconRedo,
  IconTrash,
  IconFileText,
  IconCheck,
  IconImage,
  IconEye,
  IconCode,
} from '../common/Icons';
import MarkdownView from '../common/MarkdownView';

const COLOR_PALETTE = [
  { name: 'Blurple', value: '#5865F2' },
  { name: 'Emerald', value: '#57F287' },
  { name: 'Gold', value: '#FEE75C' },
  { name: 'Rose', value: '#EB459E' },
  { name: 'Coral', value: '#ED4245' },
  { name: 'Cyan', value: '#00d2ff' },
  { name: 'White', value: '#ffffff' },
  { name: 'Charcoal', value: '#23272a' },
];

const STROKE_WIDTHS = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 5 },
  { label: 'Bold', value: 10 },
  { label: 'Marker', value: 20 },
];

export default function ProjectCanvas({ project }) {
  const { user } = useAuth();
  const isViewer = project?.user_role === 'viewer' || project?.role === 'viewer';
  const [activeMode, setActiveMode] = useState('canvas'); // 'canvas' | 'notes'
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'synced'
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInputRef = useRef(null);
  const exportMenuRef = useRef(null);

  // ==========================================
  // WHITEBOARD STATE
  // ==========================================
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen'); // 'pen' | 'line' | 'rect' | 'circle' | 'eraser' | 'sticky'
  const [color, setColor] = useState('#5865F2');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [elements, setElements] = useState([]); // array of strokes/shapes
  const [stickyNotes, setStickyNotes] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const isDrawing = useRef(false);
  const currentPath = useRef([]);
  const startPoint = useRef(null);
  const saveCanvasTimerRef = useRef(null);

  // ==========================================
  // LIVE NOTES STATE
  // ==========================================
  const [noteTitle, setNoteTitle] = useState('Project Architecture & Specs');
  const [noteContent, setNoteContent] = useState('');
  const [noteViewMode, setNoteViewMode] = useState('split'); // 'split' | 'edit' | 'preview'
  const saveNotesTimerRef = useRef(null);
  const isTypingNotes = useRef(false);

  // ==========================================
  // INITIAL DATA & SOCKETS
  // ==========================================
  useEffect(() => {
    if (!project?.id) return;

    loadCanvasData();
    loadNotesData();

    const token = localStorage.getItem('accessToken');
    const socket = getSocket() || connectSocket(token);

    socket.emit('project:join', project.id);

    // Listen for remote whiteboard drawing
    socket.on('canvas:draw', (data) => {
      if (data.action === 'stroke' && data.stroke) {
        setElements(prev => {
          const next = [...prev, data.stroke];
          redrawCanvas(next);
          return next;
        });
      } else if (data.action === 'sticky' && data.element) {
        setStickyNotes(prev => [...prev.filter(n => n.id !== data.element.id), data.element]);
      }
      setSaveStatus('synced');
    });

    socket.on('canvas:clear', () => {
      setElements([]);
      setStickyNotes([]);
      clearCanvasView();
      setSaveStatus('synced');
    });

    // Listen for remote live notes edit
    socket.on('notes:change', (data) => {
      if (!isTypingNotes.current) {
        if (data.title !== undefined) setNoteTitle(data.title);
        if (data.content !== undefined) setNoteContent(data.content);
        setSaveStatus('synced');
      }
    });

    return () => {
      socket.emit('project:leave', project.id);
      socket.off('canvas:draw');
      socket.off('canvas:clear');
      socket.off('notes:change');
    };
  }, [project?.id]);

  // Handle canvas resize on mount, container resize, and window resize
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const container = canvas.parentElement;

    const resizeCanvas = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = rect.width;
      canvas.height = rect.height;
      redrawCanvas(elements);
    };

    resizeCanvas();
    const raf = requestAnimationFrame(resizeCanvas);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      observer = new ResizeObserver(() => {
        resizeCanvas();
      });
      observer.observe(container);
    }
    window.addEventListener('resize', resizeCanvas);

    return () => {
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [elements, activeMode]);

  // Click outside listener for Export Dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  // ==========================================
  // CANVAS API CALLS
  // ==========================================
  const loadCanvasData = async () => {
    try {
      const res = await api.get(`/projects/${project.id}/canvas`);
      if (res.data?.canvas_data) {
        const parsed = typeof res.data.canvas_data === 'string'
          ? JSON.parse(res.data.canvas_data)
          : res.data.canvas_data;
        if (parsed.elements) {
          setElements(parsed.elements);
          redrawCanvas(parsed.elements);
        }
        if (parsed.stickyNotes) {
          setStickyNotes(parsed.stickyNotes);
        }
      }
    } catch (err) {
      console.warn('Canvas fetch info:', err.message);
    }
  };

  const persistCanvasDebounced = useCallback((newElements, newNotes) => {
    if (isViewer) return;
    setSaveStatus('saving');
    if (saveCanvasTimerRef.current) clearTimeout(saveCanvasTimerRef.current);

    saveCanvasTimerRef.current = setTimeout(async () => {
      try {
        await api.put(`/projects/${project.id}/canvas`, {
          canvas_data: { elements: newElements, stickyNotes: newNotes },
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Save canvas error:', err);
      }
    }, 1200);
  }, [project?.id, isViewer]);

  // ==========================================
  // DRAWING LOGIC
  // ==========================================
  const clearCanvasView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const redrawCanvas = (items) => {
    clearCanvasView();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    items.forEach(el => {
      ctx.save();
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = el.color;

      if (el.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      if (el.tool === 'pen' || el.tool === 'eraser') {
        if (el.points && el.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
        }
      } else if (el.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(el.startX, el.startY);
        ctx.lineTo(el.endX, el.endY);
        ctx.stroke();
      } else if (el.tool === 'rect') {
        ctx.strokeRect(el.startX, el.startY, el.width, el.height);
      } else if (el.tool === 'circle') {
        ctx.beginPath();
        const rx = Math.abs(el.width / 2);
        const ry = Math.abs(el.height / 2);
        const cx = el.startX + el.width / 2;
        const cy = el.startY + el.height / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    });
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    if (isViewer) return;
    if (tool === 'sticky') {
      const coords = getCanvasCoords(e);
      addStickyNote(coords.x, coords.y);
      return;
    }

    isDrawing.current = true;
    const coords = getCanvasCoords(e);
    startPoint.current = coords;
    currentPath.current = [coords];
  };

  const handlePointerMove = (e) => {
    if (isViewer || !isDrawing.current) return;
    const coords = getCanvasCoords(e);
    currentPath.current.push(coords);

    if (tool === 'pen' || tool === 'eraser') {
      // Live freehand preview
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      }
      const pts = currentPath.current;
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // For shapes, redraw background elements then draw current active preview
      redrawCanvas(elements);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';

      const sX = startPoint.current.x;
      const sY = startPoint.current.y;
      const w = coords.x - sX;
      const h = coords.y - sY;

      if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(sX, sY);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      } else if (tool === 'rect') {
        ctx.strokeRect(sX, sY, w, h);
      } else if (tool === 'circle') {
        ctx.beginPath();
        ctx.ellipse(sX + w / 2, sY + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const handlePointerUp = (e) => {
    if (isViewer || !isDrawing.current) return;
    isDrawing.current = false;
    const endCoords = getCanvasCoords(e);

    let newElement = null;
    if (tool === 'pen' || tool === 'eraser') {
      newElement = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        tool,
        color,
        strokeWidth,
        points: currentPath.current,
      };
    } else if (tool === 'line') {
      newElement = {
        id: 'el_' + Date.now(),
        tool: 'line',
        color,
        strokeWidth,
        startX: startPoint.current.x,
        startY: startPoint.current.y,
        endX: endCoords.x,
        endY: endCoords.y,
      };
    } else if (tool === 'rect') {
      newElement = {
        id: 'el_' + Date.now(),
        tool: 'rect',
        color,
        strokeWidth,
        startX: startPoint.current.x,
        startY: startPoint.current.y,
        width: endCoords.x - startPoint.current.x,
        height: endCoords.y - startPoint.current.y,
      };
    } else if (tool === 'circle') {
      newElement = {
        id: 'el_' + Date.now(),
        tool: 'circle',
        color,
        strokeWidth,
        startX: startPoint.current.x,
        startY: startPoint.current.y,
        width: endCoords.x - startPoint.current.x,
        height: endCoords.y - startPoint.current.y,
      };
    }

    if (newElement) {
      const nextElements = [...elements, newElement];
      setElements(nextElements);
      redrawCanvas(nextElements);

      // Save to undo history
      const nextHist = [...history.slice(0, historyStep + 1), nextElements];
      setHistory(nextHist);
      setHistoryStep(nextHist.length - 1);

      // Emit socket event
      const socket = getSocket();
      if (socket) {
        socket.emit('canvas:draw', {
          projectId: project.id,
          action: 'stroke',
          stroke: newElement,
        });
      }

      persistCanvasDebounced(nextElements, stickyNotes);
    }

    currentPath.current = [];
    startPoint.current = null;
  };

  // Sticky notes handler
  const addStickyNote = (x, y) => {
    if (isViewer) return;
    const newNote = {
      id: 'sticky_' + Date.now(),
      x: Math.max(20, Math.min(x, 700)),
      y: Math.max(20, Math.min(y, 450)),
      color: '#FEE75C',
      text: 'New Note...',
    };
    const nextNotes = [...stickyNotes, newNote];
    setStickyNotes(nextNotes);

    const socket = getSocket();
    if (socket) {
      socket.emit('canvas:draw', {
        projectId: project.id,
        action: 'sticky',
        element: newNote,
      });
    }

    persistCanvasDebounced(elements, nextNotes);
    setTool('pen');
  };

  const updateStickyNote = (id, text) => {
    if (isViewer) return;
    const nextNotes = stickyNotes.map(n => n.id === id ? { ...n, text } : n);
    setStickyNotes(nextNotes);
    persistCanvasDebounced(elements, nextNotes);
  };

  const deleteStickyNote = (id) => {
    if (isViewer) return;
    const nextNotes = stickyNotes.filter(n => n.id !== id);
    setStickyNotes(nextNotes);
    persistCanvasDebounced(elements, nextNotes);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (isViewer) return;
    if (historyStep > 0) {
      const prevStep = historyStep - 1;
      const prevElements = history[prevStep];
      setHistoryStep(prevStep);
      setElements(prevElements);
      redrawCanvas(prevElements);
      persistCanvasDebounced(prevElements, stickyNotes);
    } else if (historyStep === 0) {
      setHistoryStep(-1);
      setElements([]);
      redrawCanvas([]);
      persistCanvasDebounced([], stickyNotes);
    }
  };

  const handleRedo = () => {
    if (isViewer) return;
    if (historyStep < history.length - 1) {
      const nextStep = historyStep + 1;
      const nextElements = history[nextStep];
      setHistoryStep(nextStep);
      setElements(nextElements);
      redrawCanvas(nextElements);
      persistCanvasDebounced(nextElements, stickyNotes);
    }
  };

  const handleClearCanvas = () => {
    if (isViewer) return;
    if (window.confirm('Are you sure you want to clear the entire whiteboard?')) {
      setElements([]);
      setStickyNotes([]);
      clearCanvasView();
      const socket = getSocket();
      if (socket) {
        socket.emit('canvas:clear', { projectId: project.id });
      }
      persistCanvasDebounced([], []);
    }
  };

  // ==========================================
  // EXPORT & IMPORT UTILITIES
  // ==========================================
  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');

    // Fill dark workspace background
    ctx.fillStyle = '#18191c';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw main strokes & shapes
    ctx.drawImage(canvas, 0, 0);

    // Render sticky notes onto canvas context
    ctx.save();
    ctx.scale(dpr, dpr);

    stickyNotes.forEach(note => {
      const noteW = 170;
      const noteH = 120;
      const x = note.x;
      const y = note.y;

      // Note drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;

      // Note background box
      ctx.fillStyle = note.color || '#FEE75C';
      const radius = 8;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + noteW - radius, y);
      ctx.quadraticCurveTo(x + noteW, y, x + noteW, y + radius);
      ctx.lineTo(x + noteW, y + noteH - radius);
      ctx.quadraticCurveTo(x + noteW, y + noteH, x + noteW - radius, y + noteH);
      ctx.lineTo(x + radius, y + noteH);
      ctx.quadraticCurveTo(x, y + noteH, x, y + noteH - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Note Header
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('STICKY NOTE', x + 10, y + 18);

      // Note Content (Word wrapping)
      ctx.fillStyle = '#111111';
      ctx.font = '12px sans-serif';
      const lines = (note.text || '').split('\n');
      let lineY = y + 36;
      lines.forEach(line => {
        const words = line.split(' ');
        let currentLine = '';
        for (let i = 0; i < words.length; i++) {
          const testLine = currentLine + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > noteW - 20 && i > 0) {
            ctx.fillText(currentLine, x + 10, lineY);
            currentLine = words[i] + ' ';
            lineY += 16;
          } else {
            currentLine = testLine;
          }
        }
        ctx.fillText(currentLine, x + 10, lineY);
        lineY += 16;
      });
      ctx.restore();
    });

    ctx.restore();

    const link = document.createElement('a');
    link.download = `whiteboard-${project?.name || 'collabry'}-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const handleExportSVG = () => {
    const canvas = canvasRef.current;
    const width = canvas ? Math.round(canvas.clientWidth || 1200) : 1200;
    const height = canvas ? Math.round(canvas.clientHeight || 800) : 800;

    let svgContent = `<?xml version="1.0" standalone="no"?>\n`;
    svgContent += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
    svgContent += `  <rect width="100%" height="100%" fill="#18191c"/>\n`;

    elements.forEach(el => {
      const stroke = el.color || '#5865F2';
      const strokeWidth = el.strokeWidth || 3;
      if (el.tool === 'pen' && el.points && el.points.length > 1) {
        const pathData = el.points.map((p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ');
        svgContent += `  <path d="${pathData}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
      } else if (el.tool === 'line') {
        svgContent += `  <line x1="${el.startX}" y1="${el.startY}" x2="${el.endX}" y2="${el.endY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>\n`;
      } else if (el.tool === 'rect') {
        svgContent += `  <rect x="${el.startX}" y="${el.startY}" width="${el.width}" height="${el.height}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>\n`;
      } else if (el.tool === 'circle') {
        const rx = Math.abs(el.width / 2);
        const ry = Math.abs(el.height / 2);
        const cx = el.startX + el.width / 2;
        const cy = el.startY + el.height / 2;
        svgContent += `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>\n`;
      }
    });

    stickyNotes.forEach(n => {
      const color = n.color || '#FEE75C';
      const textLines = (n.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('\n');
      svgContent += `  <g transform="translate(${n.x}, ${n.y})">\n`;
      svgContent += `    <rect width="170" height="120" rx="8" fill="${color}" stroke="#000" stroke-opacity="0.1"/>\n`;
      svgContent += `    <text x="10" y="18" font-family="sans-serif" font-size="10" font-weight="bold" fill="rgba(0,0,0,0.6)">STICKY NOTE</text>\n`;
      textLines.forEach((tl, idx) => {
        svgContent += `    <text x="10" y="${36 + (idx * 16)}" font-family="sans-serif" font-size="12" fill="#111111">${tl}</text>\n`;
      });
      svgContent += `  </g>\n`;
    });

    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `whiteboard-${project?.name || 'collabry'}-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = {
      app: 'Collabry Whiteboard',
      version: 1,
      projectId: project?.id,
      projectName: project?.name,
      exportedAt: new Date().toISOString(),
      elements,
      stickyNotes,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `whiteboard-${project?.name || 'collabry'}-${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSONClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleImportJSONFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const importedElements = Array.isArray(parsed.elements) ? parsed.elements : [];
        const importedNotes = Array.isArray(parsed.stickyNotes) ? parsed.stickyNotes : [];

        if (importedElements.length === 0 && importedNotes.length === 0) {
          alert('Invalid whiteboard JSON: File contains no elements or notes.');
          return;
        }

        if (elements.length > 0 || stickyNotes.length > 0) {
          if (!window.confirm('Importing this file will replace your existing whiteboard canvas. Continue?')) {
            return;
          }
        }

        setElements(importedElements);
        setStickyNotes(importedNotes);
        setHistory([importedElements]);
        setHistoryStep(0);
        redrawCanvas(importedElements);

        const socket = getSocket();
        if (socket) {
          socket.emit('canvas:clear', { projectId: project.id });
          importedElements.forEach(item => {
            socket.emit('canvas:draw', {
              projectId: project.id,
              action: 'stroke',
              stroke: item,
            });
          });
          importedNotes.forEach(item => {
            socket.emit('canvas:draw', {
              projectId: project.id,
              action: 'sticky',
              element: item,
            });
          });
        }

        persistCanvasDebounced(importedElements, importedNotes);
      } catch (err) {
        console.error('Import parse error:', err);
        alert('Failed to parse whiteboard JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ==========================================
  // LIVE NOTES LOGIC
  // ==========================================
  const loadNotesData = async () => {
    try {
      const res = await api.get(`/projects/${project.id}/notes`);
      if (res.data) {
        if (res.data.title) setNoteTitle(res.data.title);
        if (res.data.content) setNoteContent(res.data.content);
      }
    } catch (err) {
      console.warn('Notes fetch info:', err.message);
    }
  };

  const handleNotesChange = (newTitle, newContent) => {
    if (isViewer) return;
    isTypingNotes.current = true;
    setNoteTitle(newTitle);
    setNoteContent(newContent);
    setSaveStatus('saving');

    // Emit live socket event
    const socket = getSocket();
    if (socket) {
      socket.emit('notes:change', {
        projectId: project.id,
        title: newTitle,
        content: newContent,
      });
    }

    if (saveNotesTimerRef.current) clearTimeout(saveNotesTimerRef.current);
    saveNotesTimerRef.current = setTimeout(async () => {
      try {
        await api.put(`/projects/${project.id}/notes`, {
          title: newTitle,
          content: newContent,
        });
        setSaveStatus('saved');
        isTypingNotes.current = false;
      } catch (err) {
        console.error('Save notes error:', err);
      }
    }, 1000);
  };

  const insertMarkdownSnippet = (snippet) => {
    if (isViewer) return;
    setNoteContent(prev => prev + snippet);
    handleNotesChange(noteTitle, noteContent + snippet);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([`# ${noteTitle}\n\n${noteContent}`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${noteTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
      {/* Top Collaboration Sub-Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-medium)',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        {/* Mode Switcher */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-subtle)', padding: 3, borderRadius: 'var(--radius-sm)' }}>
          <button
            onClick={() => setActiveMode('canvas')}
            className={`btn btn-sm ${activeMode === 'canvas' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 13, fontWeight: 600 }}
          >
            <IconBrush size={15} />
            <span>Whiteboard Canvas</span>
          </button>
          <button
            onClick={() => setActiveMode('notes')}
            className={`btn btn-sm ${activeMode === 'notes' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 13, fontWeight: 600 }}
          >
            <IconFileText size={15} />
            <span>Live Notes & Specs</span>
          </button>
        </div>

        {/* Live Status indicator & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: saveStatus === 'saving' ? '#FEE75C' : 'var(--discord-green)',
            fontWeight: 500,
          }}>
            {saveStatus === 'saving' ? (
              <>
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                <span>Saving cloud sync...</span>
              </>
            ) : (
              <>
                <IconCheck size={14} />
                <span>{saveStatus === 'synced' ? 'Real-time synced' : 'All changes saved'}</span>
              </>
            )}
          </div>

          {activeMode === 'canvas' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleUndo}
                disabled={isViewer}
                title="Undo (Ctrl+Z)"
                style={{ padding: '4px 8px', opacity: isViewer ? 0.4 : 1, cursor: isViewer ? 'not-allowed' : 'pointer' }}
              >
                <IconUndo size={15} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRedo}
                disabled={isViewer}
                title="Redo (Ctrl+Y)"
                style={{ padding: '4px 8px', opacity: isViewer ? 0.4 : 1, cursor: isViewer ? 'not-allowed' : 'pointer' }}
              >
                <IconRedo size={15} />
              </button>

              <div style={{ width: 1, height: 18, background: 'var(--border-medium)', margin: '0 2px' }} />

              {/* Multi-Format Export Dropdown */}
              <div style={{ position: 'relative' }} ref={exportMenuRef}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowExportMenu(prev => !prev)}
                  title="Export Whiteboard"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12 }}
                >
                  <IconDownload size={14} />
                  <span>Export</span>
                  <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
                </button>
                {showExportMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'var(--bg-primary, #1e1f22)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 8,
                      boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                      zIndex: 100,
                      minWidth: 165,
                      display: 'flex',
                      flexDirection: 'column',
                      padding: 4,
                    }}
                  >
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowExportMenu(false); handleExportPNG(); }}
                      style={{ justifyContent: 'flex-start', padding: '7px 12px', fontSize: 12, textAlign: 'left', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <IconImage size={14} /> PNG Image
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowExportMenu(false); handleExportSVG(); }}
                      style={{ justifyContent: 'flex-start', padding: '7px 12px', fontSize: 12, textAlign: 'left', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <IconCode size={14} /> SVG Vector
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowExportMenu(false); handleExportJSON(); }}
                      style={{ justifyContent: 'flex-start', padding: '7px 12px', fontSize: 12, textAlign: 'left', borderRadius: 6 }}
                    >
                      <span style={{ marginRight: 6 }}>📄</span> JSON File
                    </button>
                  </div>
                )}
              </div>

              {/* JSON Import Button */}
              {!isViewer && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleImportJSONClick}
                  title="Import Whiteboard JSON"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12 }}
                >
                  <IconUpload size={14} />
                  <span>Import JSON</span>
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleImportJSONFile}
                style={{ display: 'none' }}
              />

              <div style={{ width: 1, height: 18, background: 'var(--border-medium)', margin: '0 2px' }} />

              {!isViewer && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleClearCanvas}
                  title="Clear Canvas"
                  style={{ color: 'var(--discord-red)', padding: '4px 8px' }}
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-subtle)', padding: 2, borderRadius: 4 }}>
                <button
                  className={`btn btn-xs ${noteViewMode === 'split' ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setNoteViewMode('split')}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  Split
                </button>
                <button
                  className={`btn btn-xs ${noteViewMode === 'edit' ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setNoteViewMode('edit')}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  Edit
                </button>
                <button
                  className={`btn btn-xs ${noteViewMode === 'preview' ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setNoteViewMode('preview')}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  Preview
                </button>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDownloadMarkdown}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
              >
                <IconDownload size={14} />
                <span>Download .md</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mode 1: Whiteboard Canvas */}
      {activeMode === 'canvas' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
          {isViewer ? (
            <div className="canvas-floating-toolbar" style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 10,
              background: 'rgba(23, 24, 27, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-medium)',
              borderRadius: 12,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              fontSize: 12,
              color: 'var(--text-muted)',
              maxWidth: 'calc(100% - 28px)',
            }}>
              <IconEye size={14} />
              <span style={{ fontWeight: 600, color: 'var(--text-normal)' }}>Viewer Mode</span>
              <span style={{ opacity: 0.6 }}>• Canvas is read-only</span>
            </div>
          ) : (
            <div className="canvas-floating-toolbar" style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 10,
              background: 'rgba(23, 24, 27, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-medium)',
              borderRadius: 12,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              maxWidth: 'calc(100% - 28px)',
              flexWrap: 'wrap',
            }}>
              {/* Tool Selection */}
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { id: 'pen', label: 'Pen', icon: <IconBrush size={16} /> },
                  { id: 'line', label: 'Line', icon: <IconMinus size={16} /> },
                  { id: 'rect', label: 'Box', icon: <IconSquare size={16} /> },
                  { id: 'circle', label: 'Oval', icon: <IconCircle size={16} /> },
                  { id: 'sticky', label: 'Sticky', icon: <IconStickyNote size={16} /> },
                  { id: 'eraser', label: 'Eraser', icon: <IconTrash size={16} /> },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id)}
                    title={t.label}
                    style={{
                      background: tool === t.id ? 'var(--discord-blurple)' : 'transparent',
                      color: tool === t.id ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t.icon}
                  </button>
                ))}
              </div>

              <div style={{ width: 1, height: 22, background: 'var(--border-medium)' }} />

              {/* Colors */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    title={c.name}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: c.value,
                      border: color === c.value ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      transform: color === c.value ? 'scale(1.2)' : 'scale(1)',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'transform 0.15s',
                    }}
                  />
                ))}
              </div>

              <div style={{ width: 1, height: 22, background: 'var(--border-medium)' }} />

              {/* Stroke Width */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {STROKE_WIDTHS.map(sw => (
                  <button
                    key={sw.value}
                    onClick={() => setStrokeWidth(sw.value)}
                    title={sw.label}
                    style={{
                      padding: '3px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      background: strokeWidth === sw.value ? 'var(--bg-subtle)' : 'transparent',
                      color: strokeWidth === sw.value ? 'var(--text-heading)' : 'var(--text-muted)',
                      border: '1px solid',
                      borderColor: strokeWidth === sw.value ? 'var(--border-strong)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {sw.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Canvas Board Container */}
          <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: isViewer ? 'default' : (tool === 'eraser' ? 'cell' : 'crosshair') }}>
            <canvas
              ref={canvasRef}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                background: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 24px 24px, #18191c',
              }}
            />

            {/* Sticky Notes Render */}
            {stickyNotes.map(n => (
              <div
                key={n.id}
                style={{
                  position: 'absolute',
                  left: n.x,
                  top: n.y,
                  width: 170,
                  minHeight: 120,
                  background: n.color,
                  color: '#1a1a1a',
                  borderRadius: 8,
                  padding: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  zIndex: 5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                    Sticky Note
                  </span>
                  {!isViewer && (
                    <button
                      onClick={() => deleteStickyNote(n.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#000', opacity: 0.6 }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <textarea
                  value={n.text}
                  readOnly={isViewer}
                  onChange={(e) => updateStickyNote(n.id, e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    resize: 'none',
                    outline: 'none',
                    color: '#111',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    lineHeight: 1.4,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode 2: Live Collaborative Notes & Documentation */}
      {activeMode === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Notes Toolbar */}
          {!isViewer && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 20px',
              background: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-medium)',
              flexWrap: 'wrap',
            }}>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('**bold text**')} title="Bold">
                <strong>B</strong>
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('*italic text*')} title="Italic">
                <em>I</em>
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('### Heading\n')} title="Heading">
                H3
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('`code snippet`')} title="Inline Code">
                &lt;/&gt;
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('\n```javascript\n// code here\n```\n')} title="Code Block">
                Block
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('\n- [ ] Task item\n')} title="Task Checkbox">
                ✓ Task
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => insertMarkdownSnippet('\n> Important quote\n')} title="Quote">
                Quote
              </button>
            </div>
          )}

          {/* Document Title Header */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}>
            <input
              value={noteTitle}
              readOnly={isViewer}
              onChange={(e) => handleNotesChange(e.target.value, noteContent)}
              placeholder="Document Title..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-heading)',
              }}
            />
          </div>

          {/* Main Dual Editor / Preview Area */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {(noteViewMode === 'split' || noteViewMode === 'edit') && (
              <div style={{
                flex: noteViewMode === 'split' ? '1 1 50%' : '1 1 100%',
                display: 'flex',
                flexDirection: 'column',
                borderRight: noteViewMode === 'split' ? '1px solid var(--border-medium)' : 'none',
                background: 'var(--bg-primary)',
              }}>
                <textarea
                  value={noteContent}
                  readOnly={isViewer}
                  onChange={(e) => handleNotesChange(noteTitle, e.target.value)}
                  placeholder="Type collaborative markdown notes here..."
                  style={{
                    flex: 1,
                    width: '100%',
                    padding: 24,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    color: 'var(--text-normal)',
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                />
              </div>
            )}

            {(noteViewMode === 'split' || noteViewMode === 'preview') && (
              <div style={{
                flex: noteViewMode === 'split' ? '1 1 50%' : '1 1 100%',
                overflowY: 'auto',
                padding: 24,
                background: 'var(--bg-secondary)',
              }}>
                <div style={{ maxWidth: 800, margin: '0 auto', color: 'var(--text-normal)', lineHeight: 1.7 }}>
                  <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, color: 'var(--text-heading)', borderBottom: '1px solid var(--border-medium)', paddingBottom: 8 }}>
                    {noteTitle}
                  </h1>
                  <MarkdownView content={noteContent} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight Markdown Renderer Component
function MarkdownSimpleRenderer({ markdown }) {
  if (!markdown) {
    return <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No content yet. Start typing to see live preview.</div>;
  }

  const lines = markdown.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lines.map((line, idx) => {
        if (line.startsWith('# ')) {
          return <h1 key={idx} style={{ fontSize: 22, fontWeight: 800, margin: '14px 0 6px', color: 'var(--text-heading)' }}>{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} style={{ fontSize: 18, fontWeight: 700, margin: '12px 0 4px', color: 'var(--text-heading)' }}>{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={idx} style={{ fontSize: 15, fontWeight: 600, margin: '10px 0 4px', color: 'var(--text-heading)' }}>{line.slice(4)}</h3>;
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote key={idx} style={{
              margin: '6px 0',
              paddingLeft: 14,
              borderLeft: '3px solid var(--discord-blurple)',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              {line.slice(2)}
            </blockquote>
          );
        }
        if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
          const checked = line.startsWith('- [x] ');
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
              <input type="checkbox" checked={checked} readOnly style={{ accentColor: 'var(--discord-blurple)' }} />
              <span style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.6 : 1 }}>
                {line.slice(6)}
              </span>
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <li key={idx} style={{ marginLeft: 20 }}>
              {line.slice(2)}
            </li>
          );
        }
        if (line.trim() === '') {
          return <div key={idx} style={{ height: 6 }} />;
        }
        return <p key={idx} style={{ margin: '2px 0' }}>{line}</p>;
      })}
    </div>
  );
}
