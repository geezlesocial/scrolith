import { Capacitor } from '@capacitor/core';

export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
};

const getBrowserCoordinates = () =>
  new Promise<DeviceCoordinates>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available on this device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        reject(new Error(error?.message || 'Unable to capture your current location.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000
      }
    );
  });

export const getCurrentDeviceCoordinates = async (): Promise<DeviceCoordinates> => {
  if (!Capacitor.isNativePlatform()) {
    return getBrowserCoordinates();
  }

  const { Geolocation } = await import('@capacitor/geolocation');
  const permission = await Geolocation.requestPermissions();
  const locationPermission = permission.location || permission.coarseLocation;
  if (locationPermission === 'denied') {
    throw new Error('Location permission was denied on this device.');
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 60_000
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
};
