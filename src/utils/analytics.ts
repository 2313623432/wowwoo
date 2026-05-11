import { Platform } from 'react-native';
import analytics from '@react-native-firebase/analytics';

export function analyticsEvent(name: string, params: Record<string, any>) {
  // 仅在原生端（iOS / Android）上上报埋点，Web 端直接跳过
  if (Platform.OS === 'web') return;
  console.log('analyticsEvent', name, params);

  analytics().logEvent(name, params);
}

export default analyticsEvent;
