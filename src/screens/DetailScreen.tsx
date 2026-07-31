import React, { useState, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { RootStackParamList, Item } from '../types';
import { getItemById, deleteItem, deletePhotoFile } from '../storage/db';
import AnnotationCanvas from '../components/AnnotationCanvas';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Detail'>;
type Route = RouteProp<RootStackParamList, 'Detail'>;

export default function DetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { itemId } = route.params;
  const { user } = useAuth();
  const userId = user!.id;

  const [item, setItem] = useState<Item | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imgError, setImgError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getItemById(userId, itemId).then(item => setItem(item ?? null));
    }, [itemId])
  );

  const handleDelete = () => {
    Alert.alert('删除确认', '确定删除这个物品记录吗？照片文件也将被删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          if (item) {
            await deletePhotoFile(item.photoUri);
          }
          await deleteItem(userId, itemId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  const dateStr = new Date(item.createdAt).toLocaleString('zh-CN');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>物品详情</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteText}>删除</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.imageContainer}>
        {imgError ? (
          <View style={[styles.image, styles.imageError]}>
            <Text style={styles.errorText}>图片无法加载</Text>
          </View>
        ) : (
          <Image
            source={{ uri: item.photoUri }}
            style={styles.image}
            resizeMode="contain"
            onLoad={() => {
              Image.getSize(item.photoUri, (w, h) => {
                setImageSize({ width: w, height: h });
              });
            }}
            onError={() => setImgError(true)}
          />
        )}
        {imageSize.width > 0 && (
          <View style={StyleSheet.absoluteFill}>
            <AnnotationCanvas
              imageWidth={imageSize.width}
              imageHeight={imageSize.height}
              annotations={item.annotations}
              onAddAnnotation={() => {}}
              onDeleteAnnotation={() => {}}
              onUpdateLabel={() => {}}
              readonly
            />
          </View>
        )}
      </View>

      <ScrollView style={styles.infoSheet}>
        {item.note ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>位置备注</Text>
            <Text style={styles.sectionContent}>{item.note}</Text>
          </View>
        ) : null}

        {item.annotations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>物品圈注 ({item.annotations.length})</Text>
            {item.annotations.map((ann, i) => (
              <View key={ann.id} style={styles.annItem}>
                <View style={styles.annDot} />
                <Text style={styles.annLabel}>
                  {ann.label || `物品 ${i + 1}（未备注）`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {item.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>标签</Text>
            <View style={styles.tagRow}>
              {item.tags.map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.dateText}>拍摄于 {dateStr}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
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
  deleteText: {
    fontSize: 15,
    color: '#FF3B30',
  },
  imageContainer: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageError: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  infoSheet: {
    backgroundColor: '#fff',
    maxHeight: 280,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sectionContent: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  annItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  annDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  annLabel: {
    fontSize: 15,
    color: '#333',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
  },
  tagText: {
    fontSize: 13,
    color: '#666',
  },
  dateText: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 8,
  },
});
