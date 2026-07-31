import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList, Item } from '../types';
import { getAllItems, searchItems, deleteItem, getAllTags, importItems, isValidItem } from '../storage/db';
import SearchBar from '../components/SearchBar';
import PhotoGrid from '../components/PhotoGrid';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout } = useAuth();
  const userId = user!.id;
  const [items, setItems] = useState<Item[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  const loadData = useCallback(async () => {
    const [loaded, tags] = await Promise.all([getAllItems(userId), getAllTags(userId)]);
    // Sort by newest first
    loaded.sort((a, b) => b.createdAt - a.createdAt);
    setItems(loaded);
    setAllTags(tags);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const doSearch = useCallback(async (text: string, tag: string) => {
    let results: Item[];
    if (tag) {
      const all = await getAllItems(userId);
      results = all.filter(item => item.tags.includes(tag));
      if (text.trim()) {
        const q = text.toLowerCase().trim();
        results = results.filter(item => {
          if (item.note.toLowerCase().includes(q)) return true;
          if (item.annotations.some(a => a.label.toLowerCase().includes(q))) return true;
          return false;
        });
      }
    } else if (text.trim()) {
      results = await searchItems(userId, text);
    } else {
      results = await getAllItems(userId);
    }
    results.sort((a, b) => b.createdAt - a.createdAt);
    setItems(results);
  }, []);

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    doSearch(text, selectedTag);
  }, [selectedTag, doSearch]);

  const handleTagSelect = useCallback((tag: string) => {
    setSelectedTag(tag);
    doSearch(searchText, tag);
  }, [searchText, doSearch]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handlePressItem = useCallback((item: Item) => {
    navigation.navigate('Detail', { itemId: item.id });
  }, [navigation]);

  const handleDeleteItem = useCallback((item: Item) => {
    setDeleteTarget(item);
  }, []);

  const handleLongPressItem = useCallback((item: Item) => {
    const doDelete = async () => {
      try {
        Alert.alert('提示', '正在删除...');
        await deleteItem(userId, item.id);
        Alert.alert('成功', '删除完成');
      } catch (e) {
        Alert.alert('删除失败', String(e));
      }
      await loadData();
    };
    doDelete();
  }, [loadData]);

  const handleExport = useCallback(async () => {
    try {
      const items = await getAllItems(userId);
      if (items.length === 0) {
        Alert.alert('无数据', '没有可导出的数据');
        return;
      }
      const json = JSON.stringify(items, null, 2);
      const fileName = `找东西_备份_${new Date().toISOString().slice(0, 10)}.json`;
      const path = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: '导出数据备份' });
      } else {
        Alert.alert('提示', '导出文件已保存');
      }
    } catch {
      Alert.alert('导出失败', '请重试');
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const uri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed: unknown = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        Alert.alert('格式错误', '备份文件格式不正确，需要 JSON 数组');
        return;
      }

      const valid = parsed.filter(isValidItem);
      const skipped = parsed.length - valid.length;

      const { imported } = await importItems(userId, valid);
      await loadData();

      let msg = `成功导入 ${imported} 条记录`;
      if (skipped > 0) msg += `，跳过 ${skipped} 条无效数据`;
      Alert.alert('导入完成', msg);
    } catch {
      Alert.alert('导入失败', '文件读取失败，请确认选择了正确的备份文件');
    }
  }, [loadData]);

  const showMenu = useCallback(() => {
    const options = ['导出备份', '导入备份', '取消'];
    const destructiveIndex = undefined;
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        index => {
          if (index === 0) handleExport();
          else if (index === 1) handleImport();
        }
      );
    } else {
      // Android: use Alert as simple menu
      Alert.alert('菜单', '选择操作', [
        { text: '导出备份', onPress: handleExport },
        { text: '导入备份', onPress: handleImport },
        { text: '取消', style: 'cancel' },
      ]);
    }
  }, [handleExport, handleImport]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>找东西</Text>
            <Text style={styles.subtitle}>拍下物品，再也不怕找不到</Text>
          </View>
          <TouchableOpacity style={styles.menuBtn} onPress={showMenu}>
            <Text style={styles.menuText}>⋯</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.userRow}>
          <Text style={styles.username} numberOfLines={1}>{user?.username}</Text>
          <TouchableOpacity onPress={logout} activeOpacity={0.7}>
            <Text style={styles.logoutText}>退出</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SearchBar
        value={searchText}
        onChangeText={handleSearch}
        tags={allTags}
        selectedTag={selectedTag}
        onSelectTag={handleTagSelect}
      />

      {deleteTarget && (
        <View style={styles.deleteConfirm}>
          <Text style={styles.deleteConfirmText}>删除「{deleteTarget.note || '未备注'}」？</Text>
          <TouchableOpacity
            style={styles.deleteConfirmBtn}
            onPress={async () => {
              const id = deleteTarget.id;
              setDeleteTarget(null);
              try { await deleteItem(userId, id); } catch (e) {}
              await loadData();
            }}
          >
            <Text style={styles.deleteConfirmBtnText}>确认删除</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteCancelBtn}
            onPress={() => setDeleteTarget(null)}
          >
            <Text style={styles.deleteCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      )}

      <PhotoGrid
        items={items}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onPressItem={handlePressItem}
        onLongPressItem={handleLongPressItem}
        onDeleteItem={handleDeleteItem}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Camera')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    paddingTop: 56,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  menuText: {
    fontSize: 22,
    color: '#666',
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 34,
  },
  deleteConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3CD',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FFECB5',
    gap: 12,
    flexWrap: 'wrap',
  },
  deleteConfirmText: {
    fontSize: 14,
    color: '#856404',
    flexShrink: 1,
  },
  deleteConfirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  deleteConfirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  deleteCancelText: {
    color: '#333',
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  username: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  logoutText: {
    fontSize: 13,
    color: '#E04040',
    fontWeight: '500',
  },
});
