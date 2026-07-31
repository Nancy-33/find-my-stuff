import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Item } from '../types';
import PhotoCard from './PhotoCard';

const screenW = Dimensions.get('window').width;

interface Props {
  items: Item[];
  refreshing: boolean;
  onRefresh: () => void;
  onPressItem: (item: Item) => void;
  onLongPressItem?: (item: Item) => void;
  onDeleteItem?: (item: Item) => void;
}

export default function PhotoGrid({
  items,
  refreshing,
  onRefresh,
  onPressItem,
  onLongPressItem,
  onDeleteItem,
}: Props) {
  const renderItem = useCallback(
    ({ item, index }: { item: Item; index: number }) => (
      <View style={[styles.itemWrap, index % 2 === 0 ? styles.left : styles.right]}>
        <PhotoCard
          item={item}
          onPress={() => onPressItem(item)}
          onLongPress={onLongPressItem ? () => onLongPressItem(item) : undefined}
          onDelete={onDeleteItem ? () => onDeleteItem(item) : undefined}
        />
      </View>
    ),
    [onPressItem, onLongPressItem, onDeleteItem]
  );

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📷</Text>
        <Text style={styles.emptyText}>还没有照片</Text>
        <Text style={styles.emptyHint}>点击下方按钮拍摄第一张物品照片</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      numColumns={2}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 16,
  },
  row: {
    marginBottom: 12,
  },
  itemWrap: {
    flex: 1,
  },
  left: {
    marginRight: 8,
  },
  right: {
    marginLeft: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
