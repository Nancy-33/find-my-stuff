import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
} from 'react-native';
import Svg, { Circle, G, Text as SvgTextEl, Line } from 'react-native-svg';
import { Annotation } from '../types';
import { getImageDisplayRect, screenToImageRatio, imageRatioToScreen, radiusToScreen, ImageDisplayRect } from '../utils/imageLayout';

interface Props {
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  onAddAnnotation: (ann: Omit<Annotation, 'id'>) => void;
  onDeleteAnnotation: (id: string) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onMoveAnnotation?: (id: string, x: number, y: number) => void;
  readonly?: boolean;
}

const HIT_TARGET = 36;
const DEFAULT_RADIUS_RATIO = 0.06;
const MIN_DRAW_RADIUS = 10;

export default function AnnotationCanvas({
  imageWidth,
  imageHeight,
  annotations,
  onAddAnnotation,
  onDeleteAnnotation,
  onUpdateLabel,
  onMoveAnnotation,
  readonly = false,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });

  // --- Drawing state (React state for rendering) ---
  const [drawing, setDrawing] = useState(false);
  const [drawCenter, setDrawCenter] = useState<{ x: number; y: number } | null>(null);
  const [drawRadius, setDrawRadius] = useState(0);

  // --- Stable refs for PanResponder (avoid stale closures in useMemo([], [])) ---
  const dragIdRef = useRef<string | null>(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const layoutRef = useRef<ImageDisplayRect>({ offsetX: 0, offsetY: 0, displayWidth: 0, displayHeight: 0, scale: 1 });
  const onMoveRef = useRef(onMoveAnnotation);
  onMoveRef.current = onMoveAnnotation;
  const onAddRef = useRef(onAddAnnotation);
  onAddRef.current = onAddAnnotation;
  const readonlyRef = useRef(readonly);
  readonlyRef.current = readonly;

  // Drawing refs (PanResponder reads these, not the state variables)
  const drawingRef = useRef(false);
  const drawCenterRef = useRef<{ x: number; y: number } | null>(null);
  const drawRadiusRef = useRef(0);

  const layoutRect = getImageDisplayRect(
    containerLayout.width, containerLayout.height, imageWidth, imageHeight
  );
  layoutRef.current = layoutRect;

  // --- Coordinate helper: works around unreliable locationX/Y on web touch ---
  const getCoords = (evt: any): { x: number; y: number } => {
    const ne = evt.nativeEvent;
    // On web with touch, nativeEvent.touches[0] may carry more accurate coords
    if (ne.touches && ne.touches.length > 0) {
      const t = ne.touches[0];
      return { x: t.locationX ?? ne.locationX ?? 0, y: t.locationY ?? ne.locationY ?? 0 };
    }
    // Standard path: native (Android/iOS) + mouse on web
    return { x: ne.locationX ?? 0, y: ne.locationY ?? 0 };
  };

  // --- Hit test: returns annotation id if touch lands inside an annotation circle ---
  const hitTest = (sx: number, sy: number): string | null => {
    const anns = annotationsRef.current;
    const rect = layoutRef.current;
    for (let i = anns.length - 1; i >= 0; i--) {
      const ann = anns[i];
      const { cx, cy } = imageRatioToScreen(ann.x, ann.y, rect);
      const r = radiusToScreen(ann.radius || DEFAULT_RADIUS_RATIO, rect);
      if (Math.hypot(sx - cx, sy - cy) <= Math.max(r, HIT_TARGET)) return ann.id;
    }
    return null;
  };

  // --- PanResponder ---
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !readonlyRef.current,
    onMoveShouldSetPanResponder: (_, g) => {
      if (readonlyRef.current) return false;
      return Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2;
    },

    onPanResponderGrant: (evt) => {
      const { x, y } = getCoords(evt);
      const hit = hitTest(x, y);

      if (hit) {
        // Touch landed on an existing annotation — start drag-to-move
        dragIdRef.current = hit;
      } else {
        // Touch landed on empty space — start drawing mode
        drawingRef.current = true;
        drawCenterRef.current = { x, y };
        drawRadiusRef.current = 0;
        setDrawing(true);
        setDrawCenter({ x, y });
        setDrawRadius(0);
      }
    },

    onPanResponderMove: (evt, gs) => {
      const id = dragIdRef.current;

      if (id) {
        // Dragging an existing annotation
        const move = onMoveRef.current;
        if (!move) return;
        const { x, y } = getCoords(evt);
        const ratio = screenToImageRatio(x, y, layoutRef.current);
        move(id, ratio.x, ratio.y);
        return;
      }

      if (drawingRef.current) {
        // Drawing a new circle — update radius based on distance from center
        const r = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        drawRadiusRef.current = r;
        setDrawRadius(r);
      }
    },

    onPanResponderRelease: (evt, gs) => {
      const { x, y } = getCoords(evt);
      const id = dragIdRef.current;

      // --- Case 1: Was dragging an existing annotation ---
      if (id) {
        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          // Minimal movement — treat as tap: open label editor
          const ann = annotationsRef.current.find(a => a.id === id);
          if (ann) {
            setEditingId(ann.id);
            setEditText(ann.label);
          }
        } else {
          // Real drag — finalize the move
          const move = onMoveRef.current;
          if (move) {
            const ratio = screenToImageRatio(x, y, layoutRef.current);
            move(id, ratio.x, ratio.y);
          }
        }
        dragIdRef.current = null;
        return;
      }

      // --- Case 2: Was drawing a new circle ---
      if (drawingRef.current) {
        const center = drawCenterRef.current;
        const r = drawRadiusRef.current;

        if (center && r >= MIN_DRAW_RADIUS) {
          // Significant drag — create annotation with the drawn circle
          const ratio = screenToImageRatio(center.x, center.y, layoutRef.current);
          const radiusRatio = r / Math.min(layoutRef.current.displayWidth, layoutRef.current.displayHeight);
          onAddRef.current({
            x: Math.round(ratio.x * 10000) / 10000,
            y: Math.round(ratio.y * 10000) / 10000,
            radius: Math.round(radiusRatio * 10000) / 10000,
            label: '',
          });
        } else {
          // Very small / no drag — treat as old-style tap
          const hit = hitTest(x, y);
          if (hit) {
            // Tap on existing annotation — open editor
            const ann = annotationsRef.current.find(a => a.id === hit);
            if (ann) {
              setEditingId(ann.id);
              setEditText(ann.label);
            }
          } else {
            // Tap on empty space — create small default annotation
            const ratio = screenToImageRatio(x, y, layoutRef.current);
            onAddRef.current({
              x: ratio.x,
              y: ratio.y,
              radius: DEFAULT_RADIUS_RATIO,
              label: '',
            });
          }
        }

        // Reset drawing state
        drawingRef.current = false;
        drawCenterRef.current = null;
        drawRadiusRef.current = 0;
        setDrawing(false);
        setDrawCenter(null);
        setDrawRadius(0);
      }
    },
  }), []);

  // --- Save label edit ---
  const saveEdit = useCallback(() => {
    if (editingId) {
      onUpdateLabel(editingId, editText);
      setEditingId(null);
    }
  }, [editingId, editText, onUpdateLabel]);

  return (
    <View
      style={styles.container}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setContainerLayout({ width, height });
      }}
      {...(readonly ? {} : panResponder.panHandlers)}
    >
      <Svg style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Existing annotations */}
        {annotations.map(ann => {
          const { cx, cy } = imageRatioToScreen(ann.x, ann.y, layoutRect);
          const r = radiusToScreen(ann.radius || DEFAULT_RADIUS_RATIO, layoutRect);
          const isDragging = ann.id === dragIdRef.current;
          return (
            <G key={ann.id}>
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                stroke={isDragging ? '#007AFF' : '#FF3B30'}
                strokeWidth={isDragging ? 3 : 2.5}
                fill={isDragging ? 'rgba(0,122,255,0.2)' : 'rgba(255,59,48,0.15)'}
              />
              {ann.label ? (
                <SvgTextEl
                  x={cx}
                  y={cy - r - 6 < 0 ? 12 : cy - r - 6}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#FF3B30"
                  fontWeight="600"
                  stroke="#fff"
                  strokeWidth={1.5}
                >
                  {ann.label.length > 8 ? ann.label.slice(0, 8) + '\u2026' : ann.label}
                </SvgTextEl>
              ) : null}
            </G>
          );
        })}

        {/* Live preview circle during drawing */}
        {drawing && drawCenter && (
          <>
            <Circle
              cx={drawCenter.x}
              cy={drawCenter.y}
              r={drawRadius}
              stroke="#FF9500"
              strokeWidth={2.5}
              strokeDasharray="6,3"
              fill="rgba(255,149,0,0.1)"
            />
            <Line
              x1={drawCenter.x}
              y1={drawCenter.y}
              x2={drawCenter.x + drawRadius}
              y2={drawCenter.y}
              stroke="#FF9500"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          </>
        )}
      </Svg>

      {/* Delete buttons */}
      {!readonly &&
        annotations.map(ann => {
          const { cx, cy } = imageRatioToScreen(ann.x, ann.y, layoutRect);
          const r = radiusToScreen(ann.radius || DEFAULT_RADIUS_RATIO, layoutRect);
          return (
            <TouchableOpacity
              key={`del-${ann.id}`}
              style={[styles.delBtn, { left: cx + r - 10, top: cy - r - 10 }]}
              onPress={() => onDeleteAnnotation(ann.id)}
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
            >
              <Text style={styles.delText}>{'\u00D7'}</Text>
            </TouchableOpacity>
          );
        })}

      {/* Label editor modal */}
      <Modal visible={editingId !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>输入物品备注</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例如：钥匙在抽屉第二层"
              value={editText}
              onChangeText={setEditText}
              autoFocus
              onSubmitEditing={saveEdit}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setEditingId(null)}
              >
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={saveEdit}>
                <Text style={styles.confirmText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hint bar */}
      {!readonly && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>拖拽圈出物品 · 点击标注文字</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  delBtn: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  delText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  hint: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 280,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    color: '#333',
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#333',
  },
  modalBtns: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    color: '#666',
    fontSize: 15,
  },
  confirmBtn: {
    backgroundColor: '#007AFF',
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
