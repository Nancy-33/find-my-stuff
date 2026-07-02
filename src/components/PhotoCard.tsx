import React, { useState } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Item } from '../types';

const screenW = Dimensions.get('window').width;
const cardW = (screenW - 48) / 2;

interface Props {
  item: Item;
  onPress: () => void;
  onLongPress?: () => void;
}

export default function PhotoCard({ item, onPress, onLongPress }: Props) {
  const [imgError, setImgError] = useState(false);
  const label = item.note || item.annotations[0]?.label || '未备注';
  const date = new Date(item.createdAt).toLocaleDateString('zh-CN');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {imgError ? (
        <View style={[styles.image, styles.imageError]}>
          <Text style={styles.errorIcon}>?</Text>
          <Text style={styles.errorText}>图片无法加载</Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.photoUri }}
          style={styles.image}
          onError={() => setImgError(true)}
        />
      )}
      <View style={styles.info}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      {item.annotations.length > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.annotations.length}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: cardW,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  image: {
    width: cardW,
    height: cardW,
    backgroundColor: '#f0f0f0',
  },
  imageError: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 36,
    color: '#ccc',
  },
  errorText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  info: {
    padding: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  date: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FF3B30',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
