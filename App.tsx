import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import AnnotationScreen from './src/screens/AnnotationScreen';
import DetailScreen from './src/screens/DetailScreen';
import LoginScreen from './src/screens/LoginScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainStack() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Annotation"
        component={AnnotationScreen}
        options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen name="Detail" component={DetailScreen} />
    </Stack.Navigator>
  );
}

function AppContent() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return isLoggedIn ? <MainStack /> : (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <AppContent />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
