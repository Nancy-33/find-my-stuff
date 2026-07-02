import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { v4 as uuidv4 } from 'uuid';
import { RootStackParamList, Annotation } from '../types';
import { saveItem } from '../storage/db';
import AnnotationCanvas from '../components/AnnotationCanvas';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Annotation'>;
type Route = RouteProp<RootStackParamList, 'Annotation'>;

export default function AnnotationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { photoUri } = route.params;

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [note, setNote] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const addAnnotation = (ann: Omit<Annotation, 'id'>) => {
    const newAnn: Annotation = { ...ann, id: uuidv4() };
    setAnnotations(prev => [...prev, newAnn]);
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  const moveAnnotation = (id: string, x: number, y: number) => {
    setAnnotations(prev => prev.map(a => (a.id === id ? { ...a, x, y } : a)));
  };

  const updateLabel = (id: string, label: string) => {
    setAnnotations(prev => prev.map(a => (a.id === id ? { ...a, label } : a)));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      Alert.alert('标签已存在');
      return;
    }
    setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  };

  const save = async () => {
    if (saving) return;
    if (annotations.length === 0 && !note.trim()) {
      Alert.alert('提示', '至少添加一个圈注或输入整体备注');
      return;
    }
    setSaving(true);
    try {
      await saveItem({
        id: uuidv4(),
        photoUri,
        annotations,
        note: note.trim(),
        tags,
        createdAt: Date.now(),
      });
      navigation.popToTop();
    } catch {
      Alert.alert('保存失败', '请重试');
    } finally {
      setSaving(false);
    }
  };

  // Get image dimensions for proper coordinate mapping
  const onImageLoad = () => {
    Image.getSize(photoUri, (w, h) => {
      setImageSize({ width: w, height: h });
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← 重拍</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>标注物品</Text>
        <TouchableOpacity onPress={save} disabled={saving}>
          <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>
            {saving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri: photoUri }}
          style={styles.image}
          resizeMode="contain"
          onLoad={onImageLoad}
        />
        {imageSize.width > 0 && (
          <View style={StyleSheet.absoluteFill}>
            <AnnotationCanvas
              imageWidth={imageSize.width}
              imageHeight={imageSize.height}
              annotations={annotations}
              onAddAnnotation={addAnnotation}
              onDeleteAnnotation={deleteAnnotation}
              onUpdateLabel={updateLabel}
              onMoveAnnotation={moveAnnotation}
            />
          </View>
        )}
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.sectionTitle}>整体备注</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="例如：客厅电视柜左边第二个抽屉"
          value={note}
          onChangeText={setNote}
          placeholderTextColor="#999"
        />

        <Text style={styles.sectionTitle}>标签</Text>
        <View style={styles.tagRow}>
          {tags.map(tag => (
            <TouchableOpacity key={tag} style={styles.tag} onPress={() => removeTag(tag)}>
              <Text style={styles.tagText}>{tag} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tagInputRow}>
          <TextInput
            style={styles.tagInput}
            placeholder="添加标签，如：卧室、厨房"
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={addTag}
            placeholderTextColor="#999"
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addTagBtn} onPress={addTag}>
            <Text style={styles.addTagText}>添加</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  backText: {
    fontSize: 15,
    color: '#007AFF',
  },
  saveText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
  saveTextDisabled: {
    color: '#999',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    marginTop: 8,
  },
  noteInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#007AFF',
  },
  tagText: {
    fontSize: 13,
    color: '#fff',
  },
  tagInputRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  tagInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  addTagBtn: {
    paddingHorizontal: 16,
    height: 38,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTagText: {
    fontSize: 14,
    color: '#333',
  },
});
