import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Camera'>;

export default function CameraScreen() {
  const navigation = useNavigation<Nav>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [webCamFailed, setWebCamFailed] = useState(false);
  const [permTimedOut, setPermTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!permission) {
        setPermTimedOut(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [permission]);

  const tryWebCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setWebCamFailed(false);
      await requestPermission();
    } catch (e) {
      setWebCamFailed(true);
    }
  };

  const resizeImageForWeb = (dataUri: string, maxDim = 1024): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(dataUri); // Already small enough
          return;
        }
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load image for resize'));
      img.src = dataUri;
    });
  };

  const copyToAppDir = async (uri: string) => {
    if (Platform.OS === 'web') {
      // Resize on web to keep base64 URIs small enough for localStorage
      return await resizeImageForWeb(uri);
    }
    const fileName = `photo_${Date.now()}.jpg`;
    const dest = FileSystem.documentDirectory + fileName;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  };

  const takePicture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    const timeout = setTimeout(() => setCapturing(false), 15000);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      clearTimeout(timeout);
      if (!photo?.uri) {
        Alert.alert('拍照失败', '请重试');
        return;
      }
      const dest = await copyToAppDir(photo.uri);
      navigation.replace('Annotation', { photoUri: dest });
    } catch {
      clearTimeout(timeout);
      Alert.alert('拍照失败', '请重试');
    } finally {
      setCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!req.granted) {
        Alert.alert('需要相册权限', '需要相册权限，请在系统设置中开启', [
          { text: '取消', style: 'cancel' },
          { text: '前往设置', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      try {
        const dest = await copyToAppDir(result.assets[0].uri);
        navigation.replace('Annotation', { photoUri: dest });
      } catch {
        Alert.alert('加载失败', '图片加载失败，请重试');
      }
    }
  };

  if (!permission) {
    // On web, if permissions API times out (e.g. HarmonyOS), fall through
    if (Platform.OS === 'web' && permTimedOut) {
      // Fall through to the permission-denied UI below
    } else {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>正在检查相机权限...</Text>
        </View>
      );
    }
  }

  if (!permission || !permission.granted) {
    if (Platform.OS === 'web') {
      if (!permission || webCamFailed) {
        return (
          <View style={styles.permContainer}>
            <Text style={styles.permTitle}>相机不可用</Text>
            <Text style={styles.permDesc}>
              您的浏览器不支持相机，或已拒绝相机权限。请使用相册选择照片。
            </Text>
            <TouchableOpacity
              style={styles.permBtn}
              onPress={pickFromGallery}
              activeOpacity={0.7}
            >
              <Text style={styles.permBtnText}>从相册选择</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.permContainer}>
          <Text style={styles.permTitle}>需要相机权限</Text>
          <Text style={styles.permDesc}>为了拍摄物品照片，需要访问您的相机</Text>
          <TouchableOpacity
            style={styles.permBtn}
            onPress={tryWebCamera}
            activeOpacity={0.7}
          >
            <Text style={styles.permBtnText}>允许相机权限</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={pickFromGallery}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>从相册选择</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Native (Android / iOS)
    if (permission && permission.canAskAgain) {
      return (
        <View style={styles.permContainer}>
          <Text style={styles.permTitle}>需要相机权限</Text>
          <Text style={styles.permDesc}>为了拍摄物品照片，需要访问您的相机</Text>
          <TouchableOpacity
            style={styles.permBtn}
            onPress={requestPermission}
            activeOpacity={0.7}
          >
            <Text style={styles.permBtnText}>授予相机权限</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.permContainer}>
        <Text style={styles.permTitle}>需要相机权限</Text>
        <Text style={styles.permDesc}>相机权限已被拒绝，请在系统设置中手动开启</Text>
        <TouchableOpacity
          style={styles.permBtn}
          onPress={() => Linking.openSettings()}
          activeOpacity={0.7}
        >
          <Text style={styles.permBtnText}>前往设置</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.galleryBtn}
            onPress={pickFromGallery}
            activeOpacity={0.7}
          >
            <Text style={styles.galleryIcon}>🖼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureBtn}
            onPress={takePicture}
            disabled={capturing}
            activeOpacity={0.7}
          >
            {capturing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </TouchableOpacity>

          <View style={{ width: 48, height: 48 }} />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 16,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  galleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryIcon: {
    fontSize: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#666',
  },
  permContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  permDesc: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  permBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  permBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
