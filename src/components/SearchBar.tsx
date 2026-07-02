import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  tags: string[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
}

export default function SearchBar({ value, onChangeText, tags, selectedTag, onSelectTag }: Props) {
  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="搜索物品名称或位置..."
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#999"
        returnKeyType="search"
      />
      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, selectedTag === tag && styles.tagActive]}
              onPress={() => onSelectTag(selectedTag === tag ? '' : tag)}
            >
              <Text style={[styles.tagText, selectedTag === tag && styles.tagTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  input: {
    height: 44,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: '#eee',
  },
  tagActive: {
    backgroundColor: '#007AFF',
  },
  tagText: {
    fontSize: 13,
    color: '#666',
  },
  tagTextActive: {
    color: '#fff',
  },
});
