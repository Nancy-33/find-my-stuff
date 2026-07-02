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
import Svg, { Circle, G, Text as SvgTextEl } from 'react-native-svg';
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

  // All mutable state accessible from stable PanResponder via refs
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

  const layoutRect = getImageDisplayRect(
    containerLayout.width, containerLayout.height, imageWidth, imageHeight
  );
  layoutRef.current = layoutRect;

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

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !readonlyRef.current,
    onMoveShouldSetPanResponder: (_, g) => {
      if (readonlyRef.current) return false;
      return Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2;
    },

    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      const hit = hitTest(locationX, locationY);
      if (hit) {
        dragIdRef.current = hit;
      }
    },

    onPanResponderMove: (evt) => {
      const id = dragIdRef.current;
      if (!id) return;
      const move = onMoveRef.current;
      if (!move) return;
      const { locationX, locationY } = evt.nativeEvent;
      const ratio = screenToImageRatio(locationX, locationY, layoutRef.current);
      move(id, ratio.x, ratio.y);
    },

    onPanResponderRelease: (evt, gs) => {
      const { locationX, locationY } = evt.nativeEvent;
      const id = dragIdRef.current;

      if (id) {
        const move = onMoveRef.current;
        if (move) {
          const ratio = screenToImageRatio(locationX, locationY, layoutRef.current);
          move(id, ratio.x, ratio.y);
        }
        dragIdRef.current = null;
        return;
      }

      // Tap (minimal movement)
      if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
        const hit = hitTest(locationX, locationY);
        if (hit) {
          const ann = annotationsRef.current.find(a => a.id === hit);
          if (ann) {
            setEditingId(ann.id);
            setEditText(ann.label);
          }
        } else {
          const ratio = screenToImageRatio(locationX, locationY, layoutRef.current);
          onAddRef.current({
            x: ratio.x,
            y: ratio.y,
            radius: DEFAULT_RADIUS_RATIO,
            label: '',
          });
        }
      }
    },
  }), []);

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
      <Svg style={StyleSheet.absoluteFill}>
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
      </Svg>

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
              <Text style={styles.delText}>×</Text>
            </TouchableOpacity>
          );
        })}

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

      {!readonly && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>点击添加圈注 · 拖拽移动位置</Text>
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
