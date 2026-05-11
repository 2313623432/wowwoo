import { ComingSoonModal } from '@/components/ComingSoonModal';
import { PreviewableImage } from '@/components/PreviewableImage';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { usePhoneMode } from '@/contexts/PhoneModeContext';
import {
  apiRequest,
  BASE_URL,
  buildImageUrlFromKey,
  fetchImageUrlPrefix,
} from '@/services/api';
import { clearImageFileCache } from '@/services/imageCache';
import {
  buildLingyaoRechargeUrl,
  getLingyaoApiKey,
  getLingyaoStatus,
  loginLingyao,
  rechargeLingyao,
  registerLingyao,
  unbindLingyao,
} from '@/services/lingyao';
import {
  getMe,
  updateMe,
  uploadAvatarFile,
  UserApiConfig,
} from '@/services/users';
import { Alert } from '@/utils/alert';
import { sendJPushLocalNotification, setJPushEnabled } from '@/utils/jpush';
import {
  getLocalAppVersion,
  isVersionDifferent,
  parseVersionFromUrl,
} from '@/utils/version';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearAllLocalCache } from '../../services/localCache';

const CONSTELLATIONS = [
  '白羊座',
  '金牛座',
  '双子座',
  '巨蟹座',
  '狮子座',
  '处女座',
  '天秤座',
  '天蝎座',
  '射手座',
  '摩羯座',
  '水瓶座',
  '双鱼座',
];

type PreferenceForm = {
  identity_tags: string;
  interests: string;
  chat_style: string;
  age: string;
  gender: 'female' | 'male' | 'secret';
  constellation: string;
  forbidden_topics: string;
};

type ApiConfigForm = {
  base_url: string;
  token: string;
  model: string;
};

type LingyaoRegisterForm = {
  username: string;
  password: string;
  invite_code: string;
};

type LingyaoLoginForm = {
  username: string;
  password: string;
};

type LingyaoPaymentMethod = 'alipay' | 'wxpay';

function maskApiKey(value: string) {
  if (value.length <= 12) return '••••••••';
  return `${value.slice(0, 6)}••••••••${value.slice(-4)}`;
}

function isValidApiPlatformPassword(value: string) {
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(value);
}

type LingyaoInfo = {
  bound: boolean;
  username: string;
  base_url: string;
  api_key: string;
  api_key_masked: string;
  has_session: boolean;
  lingyao_user_id: string | null;
};

const defaultPreferences: PreferenceForm = {
  identity_tags: '',
  interests: '',
  chat_style: '',
  age: '',
  gender: 'secret',
  constellation: '',
  forbidden_topics: '',
};

const defaultApiConfig: ApiConfigForm = {
  base_url: '',
  token: '',
  model: '',
};

const defaultLingyaoRegisterForm: LingyaoRegisterForm = {
  username: '',
  password: '',
  invite_code: '',
};

const defaultLingyaoLoginForm: LingyaoLoginForm = {
  username: '',
  password: '',
};

function prefFromApi(p: Record<string, unknown> | undefined): PreferenceForm {
  if (!p) return { ...defaultPreferences };
  return {
    identity_tags: typeof p.identity_tags === 'string' ? p.identity_tags : '',
    interests: typeof p.interests === 'string' ? p.interests : '',
    chat_style: typeof p.chat_style === 'string' ? p.chat_style : '',
    age: typeof p.age === 'string' ? p.age : p.age != null ? String(p.age) : '',
    gender: p.gender === 'female' || p.gender === 'male' ? p.gender : 'secret',
    constellation: typeof p.constellation === 'string' ? p.constellation : '',
    forbidden_topics:
      typeof p.forbidden_topics === 'string' ? p.forbidden_topics : '',
  };
}

function apiConfigFromApi(c: UserApiConfig | null | undefined): ApiConfigForm {
  if (!c) return { ...defaultApiConfig };
  return {
    base_url: typeof c.base_url === 'string' ? c.base_url : '',
    token: typeof c.token === 'string' ? c.token : '',
    model: typeof c.model === 'string' ? c.model : '',
  };
}

function apiConfigToApi(f: ApiConfigForm): UserApiConfig {
  return {
    base_url: f.base_url.trim() || undefined,
    token: f.token.trim() || undefined,
    model: f.model.trim() || undefined,
  };
}

function prefToApi(f: PreferenceForm): Record<string, unknown> {
  return {
    identity_tags: f.identity_tags.trim() || undefined,
    interests: f.interests.trim() || undefined,
    chat_style: f.chat_style.trim() || undefined,
    age: f.age.trim() || undefined,
    gender: f.gender,
    constellation: f.constellation.trim() || undefined,
    forbidden_topics: f.forbidden_topics.trim() || undefined,
  };
}

const AVATAR_SIZE = 64;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function RowItem({
  icon,
  label,
  onPress,
  right,
  showArrow = true,
  first,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showArrow?: boolean;
  first?: boolean;
}) {
  const rowStyle = [styles.listRow, first && styles.listRowFirst];
  const content = (
    <>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      {right != null ? (
        <View style={styles.rowRight}>{right}</View>
      ) : showArrow ? (
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={rowStyle} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={rowStyle}>{content}</View>;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { openApiConfig } = useLocalSearchParams<{ openApiConfig?: string }>();
  const { user, logout, updateProfile, uploadAvatar } = useAuth();
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [editingNickname, setEditingNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [preferenceModalVisible, setPreferenceModalVisible] = useState(false);
  const [apiConfigModalVisible, setApiConfigModalVisible] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const { phoneModeEnabled, setPhoneModeEnabled, setWallpaperUri } =
    usePhoneMode();

  const [preferences, setPreferences] =
    useState<PreferenceForm>(defaultPreferences);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [constellationPickerVisible, setConstellationPickerVisible] =
    useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfigForm>(defaultApiConfig);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [lingyaoModalVisible, setLingyaoModalVisible] = useState(false);
  const [lingyaoLoading, setLingyaoLoading] = useState(false);
  const [lingyaoActionLoading, setLingyaoActionLoading] = useState<
    'register' | 'login' | 'apiKey' | 'recharge' | 'unbind' | 'import' | null
  >(null);
  const [lingyaoInfo, setLingyaoInfo] = useState<LingyaoInfo | null>(null);
  const [lingyaoRegisterForm, setLingyaoRegisterForm] =
    useState<LingyaoRegisterForm>(defaultLingyaoRegisterForm);
  const [lingyaoLoginForm, setLingyaoLoginForm] = useState<LingyaoLoginForm>(
    defaultLingyaoLoginForm
  );
  const [lingyaoAmount, setLingyaoAmount] = useState('10');
  const [lingyaoPaymentMethod, setLingyaoPaymentMethod] =
    useState<LingyaoPaymentMethod>('alipay');
  const [showLingyaoApiKey, setShowLingyaoApiKey] = useState(false);
  const [lingyaoRedirecting, setLingyaoRedirecting] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    url: string;
  } | null>(null);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [latestVersionModalVisible, setLatestVersionModalVisible] =
    useState(false);

  const triggerSentryTestError = () => {
    throw new Error('Sentry 手动测试错误（我的偏好设置下方）');
  };

  const clearCache = useCallback(() => {
    Alert.alert(
      '清除缓存',
      '将清除本地聊天记录缓存与头像缓存文件，确定继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllLocalCache();
              await clearImageFileCache();
              Alert.alert('已清除', '本地缓存已清除');
            } catch {
              Alert.alert('清除失败', '请稍后重试');
            }
          },
        },
      ]
    );
  }, []);

  useEffect(() => {
    if (openApiConfig === '1') {
      setApiConfigModalVisible(true);
    }
  }, [openApiConfig]);

  const loadPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    try {
      const me = await getMe(user?.token || '');
      setPreferences(
        prefFromApi(me.profile as Record<string, unknown> | undefined)
      );
      setApiConfig(apiConfigFromApi(me.api_config ?? undefined));
    } catch {
      setPreferences(defaultPreferences);
      setApiConfig({ ...defaultApiConfig });
    } finally {
      setPreferencesLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    if (preferenceModalVisible || apiConfigModalVisible) {
      loadPreferences();
    }
  }, [
    preferenceModalVisible,
    apiConfigModalVisible,
    user?.token,
    loadPreferences,
  ]);

  const savePreferences = async () => {
    setPreferencesSaving(true);
    try {
      await updateMe(user?.token || '', {
        profile: prefToApi(preferences),
      });
      setPreferenceModalVisible(false);
    } finally {
      setPreferencesSaving(false);
    }
  };

  const saveApiConfig = async () => {
    setPreferencesSaving(true);
    try {
      await updateMe(user?.token || '', {
        api_config: apiConfigToApi(apiConfig),
      });
      setApiConfigModalVisible(false);
    } finally {
      setPreferencesSaving(false);
    }
  };

  const fetchModelsByCredentials = useCallback(
    async (baseUrl: string, token: string) => {
      const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        throw new Error(`获取模型失败（${res.status}）`);
      }
      const data = await res.json();
      let modelIds: string[] = [];
      if (Array.isArray(data)) {
        modelIds = data
          .map((item) =>
            typeof item === 'string'
              ? item
              : typeof item?.id === 'string'
                ? item.id
                : null
          )
          .filter((m): m is string => !!m);
      } else if (Array.isArray(data?.data)) {
        modelIds = data.data
          .map((item: any) =>
            typeof item === 'string'
              ? item
              : typeof item?.id === 'string'
                ? item.id
                : null
          )
          .filter((m: string | null): m is string => !!m);
      } else if (Array.isArray(data?.models)) {
        modelIds = data.models
          .map((item: any) =>
            typeof item === 'string'
              ? item
              : typeof item?.id === 'string'
                ? item.id
                : null
          )
          .filter((m: string | null): m is string => !!m);
      }
      if (!modelIds.length) {
        throw new Error('未从接口中解析到任何模型');
      }
      return modelIds;
    },
    []
  );

  const fetchModels = useCallback(async () => {
    const baseUrl = apiConfig.base_url.trim();
    const token = apiConfig.token.trim();
    if (!baseUrl || !token) {
      setModelsError('请先填写 Base URL 和 Token');
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const modelIds = await fetchModelsByCredentials(baseUrl, token);
      setModels(modelIds);
    } catch (e: any) {
      setModelsError(e?.message || '获取模型失败');
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [apiConfig.base_url, apiConfig.token, fetchModelsByCredentials]);

  const refreshLingyaoInfo = useCallback(
    async (showError = false, asAction = false) => {
      if (!user?.token) return null;
      if (asAction) {
        setLingyaoActionLoading('apiKey');
      } else {
        setLingyaoLoading(true);
      }
      try {
        const status = await getLingyaoStatus(user.token);
        const nextInfo: LingyaoInfo = {
          bound: Boolean(status.bound),
          username: status.account || '',
          base_url: status.base_url || '',
          api_key: '',
          api_key_masked: status.api_key_masked || '',
          has_session: Boolean(status.has_session),
          lingyao_user_id: status.lingyao_user_id,
        };

        if (status.bound) {
          try {
            const apiKeyInfo = await getLingyaoApiKey(user.token);
            nextInfo.username = apiKeyInfo.account || nextInfo.username;
            nextInfo.base_url = apiKeyInfo.base_url || nextInfo.base_url;
            nextInfo.api_key = apiKeyInfo.api_key || '';
            if (!nextInfo.api_key_masked && nextInfo.api_key) {
              nextInfo.api_key_masked = maskApiKey(nextInfo.api_key);
            }
          } catch {}
        }

        setLingyaoInfo(nextInfo);
        return nextInfo;
      } catch (e: any) {
        setLingyaoInfo(null);
        if (showError) {
          Alert.alert('api 平台', e?.message || '获取api 平台信息失败');
        }
        return null;
      } finally {
        if (asAction) {
          setLingyaoActionLoading(null);
        } else {
          setLingyaoLoading(false);
        }
      }
    },
    [user?.token]
  );

  useEffect(() => {
    if (!lingyaoModalVisible) return;
    setShowLingyaoApiKey(false);
    refreshLingyaoInfo(false);
    if (user?.phone) {
      setLingyaoRegisterForm((form) =>
        form.username ? form : { ...form, username: user.phone }
      );
      setLingyaoLoginForm((form) =>
        form.username ? form : { ...form, username: user.phone }
      );
    }
  }, [lingyaoModalVisible, refreshLingyaoInfo, user?.phone]);

  const openLingyaoRechargePage = useCallback(
    async (
      url: string,
      formData: Record<string, string | number | null | undefined>
    ) => {
      const doc = typeof document !== 'undefined' ? document : null;
      if (Platform.OS === 'web' && doc?.createElement) {
        const form = doc.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.target = '_self';
        Object.entries(formData).forEach(([key, value]) => {
          if (value == null) return;
          const input = doc.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        });
        doc.body.appendChild(form);
        form.submit();
        doc.body.removeChild(form);
        return;
      }
      const finalUrl = buildLingyaoRechargeUrl(url, formData);
      try {
        await Linking.openURL(finalUrl);
      } catch {
        await WebBrowser.openBrowserAsync(finalUrl);
      }
    },
    []
  );

  const handleLingyaoRegister = async () => {
    const username = lingyaoRegisterForm.username.trim();
    const password = lingyaoRegisterForm.password.trim();
    const invite_code = lingyaoRegisterForm.invite_code.trim();
    if (!username || !password) {
      Alert.alert('api 平台注册', '请先填写账号和密码');
      return;
    }
    if (!isValidApiPlatformPassword(password)) {
      Alert.alert('api 平台注册', '密码需至少 8 位，且必须同时包含字母和数字');
      return;
    }
    setLingyaoActionLoading('register');
    try {
      const result = await registerLingyao(user?.token || '', {
        username,
        password,
        invite_code,
      });
      if (!result.register_result?.success) {
        throw new Error(result.register_result?.message || '注册失败');
      }
      setLingyaoLoginForm({ username, password });
      try {
        await loginLingyao(user?.token || '', { username, password });
      } catch {}
      const info = await refreshLingyaoInfo(false);
      Alert.alert(
        'api 平台注册成功',
        info?.bound && info?.username === username
          ? 'api 平台账号已注册并绑定成功，现在可以查看 API Key 并进行充值。'
          : 'api 平台账号已注册成功，请继续绑定已有api 平台账号完成绑定。'
      );
    } catch (e: any) {
      Alert.alert('api 平台注册', e?.message || '注册失败，请稍后重试');
    } finally {
      setLingyaoActionLoading(null);
    }
  };

  const handleLingyaoLogin = async () => {
    const username = lingyaoLoginForm.username.trim();
    const password = lingyaoLoginForm.password.trim();
    if (!username || !password) {
      Alert.alert('绑定api 平台账号', '请先填写账号和密码');
      return;
    }
    setLingyaoActionLoading('login');
    try {
      await loginLingyao(user?.token || '', { username, password });
      const info = await refreshLingyaoInfo(false);
      Alert.alert(
        '绑定成功',
        info?.bound
          ? 'api 平台账号已绑定，可直接查看 API Key 并进行充值。'
          : '绑定结果已返回成功，但当前状态未确认，请点击右上角刷新重试。'
      );
    } catch (e: any) {
      Alert.alert('绑定api 平台账号', e?.message || '绑定失败，请稍后重试');
    } finally {
      setLingyaoActionLoading(null);
    }
  };

  const handleLingyaoRecharge = async () => {
    const amount = Number(lingyaoAmount);
    if (!lingyaoInfo?.bound || !lingyaoInfo?.username) {
      Alert.alert('api 平台充值', '请先注册或绑定api 平台账号');
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      Alert.alert('api 平台充值', '请输入正确的整数充值金额');
      return;
    }
    setLingyaoActionLoading('recharge');
    try {
      const result = await rechargeLingyao(user?.token || '', {
        channel: 'epay',
        payload: {
          amount,
          payment_method: lingyaoPaymentMethod,
        },
      });
      if (!result?.url || !result?.data) {
        throw new Error('未获取到支付页面信息');
      }
      setLingyaoRedirecting(true);
      await openLingyaoRechargePage(result.url, result.data);
      if (Platform.OS !== 'web') {
        setTimeout(() => {
          setLingyaoRedirecting(false);
        }, 1200);
      }
    } catch (e: any) {
      setLingyaoRedirecting(false);
      Alert.alert('api 平台充值', e?.message || '创建充值订单失败，请稍后重试');
    } finally {
      setLingyaoActionLoading(null);
    }
  };

  const handleLingyaoUnbind = async () => {
    Alert.alert(
      '解绑api 平台账号',
      '解绑后将无法继续查看 API Key 或代充值，确认解绑吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '解绑',
          style: 'destructive',
          onPress: async () => {
            setLingyaoActionLoading('unbind');
            try {
              await unbindLingyao(user?.token || '');
              setLingyaoInfo(null);
              setModels([]);
              setModelsError(null);
              Alert.alert('解绑成功', 'api 平台账号已解绑');
            } catch (e: any) {
              Alert.alert(
                '解绑api 平台账号',
                e?.message || '解绑失败，请稍后重试'
              );
            } finally {
              setLingyaoActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleImportLingyaoApiConfig = async () => {
    const baseUrl = lingyaoInfo?.base_url?.trim();
    const token = lingyaoInfo?.api_key?.trim();
    if (!baseUrl || !token) {
      Alert.alert(
        '导入 API 配置',
        '请先确保已绑定api 平台账号并成功获取 API Key'
      );
      return;
    }
    setLingyaoActionLoading('import');
    try {
      const modelIds = await fetchModelsByCredentials(baseUrl, token);
      const importedModel = 'qwen-plus';
      const nextConfig: ApiConfigForm = {
        base_url: baseUrl,
        token,
        model: importedModel,
      };
      await updateMe(user?.token || '', {
        api_config: apiConfigToApi(nextConfig),
      });
      setApiConfig(nextConfig);
      setModels(modelIds);
      setModelsError(null);
      setLingyaoModalVisible(false);
      setApiConfigModalVisible(true);
      Alert.alert(
        '导入成功',
        nextConfig.model
          ? `已导入 Base URL、API Key，并默认使用模型 ${nextConfig.model}`
          : '已导入 Base URL 与 API Key'
      );
    } catch (e: any) {
      Alert.alert('导入 API 配置', e?.message || '导入失败，请稍后重试');
    } finally {
      setLingyaoActionLoading(null);
    }
  };

  const handleCopyLingyaoApiKey = async () => {
    const apiKey = lingyaoInfo?.api_key?.trim();
    if (!apiKey) {
      Alert.alert('复制 API Key', '当前还没有可复制的 API Key');
      return;
    }
    try {
      await Clipboard.setStringAsync(apiKey);
      Alert.alert('复制成功', 'API Key 已复制到剪贴板');
    } catch (e: any) {
      Alert.alert('复制 API Key', e?.message || '复制失败，请稍后重试');
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSettingsModalVisible(true)}
          style={styles.headerRightBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="settings-outline" size={24} color={theme.pink} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const onLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const openNicknameEdit = () => {
    setEditingNickname(user?.nickname ?? '');
    setNicknameModalVisible(true);
  };

  const saveNickname = async () => {
    const trimmed = editingNickname.trim();
    setSavingNickname(true);
    try {
      await updateProfile({ nickname: trimmed || undefined });
      setNicknameModalVisible(false);
    } finally {
      setSavingNickname(false);
    }
  };

  const checkForUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const data = await apiRequest<{ url?: string }>(
        '/api/v1/external/download_url',
        { method: 'GET' }
      );
      const url = typeof data?.url === 'string' ? data.url : null;
      if (!url) {
        setLatestVersionModalVisible(true);
        return;
      }
      const remoteVersion = parseVersionFromUrl(url);
      if (!remoteVersion) {
        setLatestVersionModalVisible(true);
        return;
      }
      const localVersion = getLocalAppVersion();
      if (!isVersionDifferent(localVersion, remoteVersion)) {
        setLatestVersionModalVisible(true);
        return;
      }
      setUpdateInfo({ version: remoteVersion, url });
      setUpdateModalVisible(true);
    } catch {
      Alert.alert('检查更新', '检查失败，请稍后重试或确认网络正常');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const pickAvatar = async () => {
    // 与聊天/壁纸一致：原生端 ImagePicker 裁剪，Web 端 DocumentPicker；上传前压缩、成功后优先读本地
    if (Platform.OS !== 'web') {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('提示', '需要相册权限才能选择头像');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.uri) return;
      const file = {
        uri: asset.uri,
        name:
          asset.fileName ??
          `avatar_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      };
      setUploadingAvatar(true);
      try {
        await uploadAvatar(file);
      } finally {
        setUploadingAvatar(false);
      }
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const file = (result as any).output?.[0] ?? {
      uri: asset.uri,
      name:
        asset.name ??
        `avatar_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    };
    setUploadingAvatar(true);
    try {
      await uploadAvatar(file as any);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // 优先用 localUri（file:///content://）或远程 URL；仅相对路径才拼 BASE_URL
  const avatarUri = user?.avatarUri
    ? user.avatarUri.startsWith('http') ||
      user.avatarUri.startsWith('file://') ||
      user.avatarUri.startsWith('content://')
      ? user.avatarUri
      : `${BASE_URL.replace(/\/$/, '')}${user.avatarUri}`
    : null;
  const lingyaoBound = Boolean(lingyaoInfo?.bound);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* 用户信息卡片 */}
        <View style={styles.card}>
          <View style={styles.userRow}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={user?.avatarUri ? undefined : pickAvatar}
              onLongPress={user?.avatarUri ? pickAvatar : undefined}
              activeOpacity={0.8}
              disabled={uploadingAvatar}
            >
              {user?.avatarUri ? (
                user.avatarUri.startsWith('http') ||
                user.avatarUri.startsWith('file://') ||
                user.avatarUri.startsWith('content://') ? (
                  <PreviewableImage
                    source={{ uri: user.avatarUri }}
                    style={styles.avatar}
                    accessibilityLabel="个人头像"
                  />
                ) : (
                  <PreviewableImage
                    source={{
                      uri: `${BASE_URL.replace(/\/$/, '')}${user.avatarUri}`,
                    }}
                    style={styles.avatar}
                    accessibilityLabel="个人头像"
                  />
                )
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>点击上传</Text>
                </View>
              )}
              {uploadingAvatar && (
                <View style={[styles.avatarOverlay, styles.avatarOverlaySize]}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.userInfo}
              onPress={openNicknameEdit}
              activeOpacity={0.7}
            >
              <Text style={styles.nickname}>
                {user?.nickname ? user.nickname : '未设置昵称'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.gridIconWrap}
              onPress={() => setPreferenceModalVisible(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="grid-outline"
                size={22}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* 功能列表卡片 */}
        <View style={[styles.card, { marginTop: 50 }]}>
          <RowItem
            first
            icon={
              <Ionicons
                name="filter-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="我的偏好设置"
            onPress={() => setPreferenceModalVisible(true)}
          />
          {/* <RowItem
          icon={
            <Ionicons
              name="warning-outline"
              size={22}
              color={theme.textSecondary}
            />
          }
          label="测试 Sentry 错误"
          onPress={triggerSentryTestError}
        /> */}
          <RowItem
            icon={
              <Ionicons
                name="code-slash-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="AI 模型配置"
            onPress={() => setApiConfigModalVisible(true)}
          />
          <RowItem
            icon={
              <Ionicons
                name="wallet-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="api 平台代充值"
            onPress={() => setLingyaoModalVisible(true)}
            right={
              lingyaoBound ? (
                <View style={styles.lingyaoInlineBadge}>
                  <Text style={styles.lingyaoInlineBadgeText}>已绑定</Text>
                </View>
              ) : undefined
            }
            showArrow={!lingyaoBound}
          />
          <RowItem
            icon={
              <Ionicons
                name="phone-portrait-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="手机模式"
            showArrow={false}
            right={
              <Switch
                value={phoneModeEnabled}
                onValueChange={setPhoneModeEnabled}
                trackColor={{ false: '#e2e8f0', true: theme.wechatGreen }}
                thumbColor="#fff"
              />
            }
          />
          {phoneModeEnabled && (
            <RowItem
              icon={
                <Ionicons
                  name="image-outline"
                  size={22}
                  color={theme.textSecondary}
                />
              }
              label="自定义壁纸"
              right={
                uploadingWallpaper ? (
                  <ActivityIndicator size="small" color={theme.pink} />
                ) : undefined
              }
              onPress={async () => {
                try {
                  if (uploadingWallpaper) return;
                  // web 端：使用 DocumentPicker，直接拿到 File 传给 uploadAvatarFile
                  if (Platform.OS === 'web') {
                    const result = await DocumentPicker.getDocumentAsync({
                      type: 'image/*',
                      copyToCacheDirectory: true,
                    });
                    if (result.canceled) return;
                    const file = (result as any).output?.[0];
                    if (!file) return;

                    setUploadingWallpaper(true);
                    try {
                      await fetchImageUrlPrefix().catch(() => '');
                      const uploadRes = await uploadAvatarFile(
                        user?.token || '',
                        file,
                        { compress: true }
                      );
                      if (!uploadRes?.imageId) {
                        Alert.alert('上传失败', '图片上传失败，请稍后重试');
                        return;
                      }
                      const url = buildImageUrlFromKey(uploadRes.imageId);
                      const displayUri = uploadRes.localUri ?? url;
                      if (!displayUri) {
                        Alert.alert('上传失败', '未获取到可访问的图片链接');
                        return;
                      }
                      setWallpaperUri(displayUri);
                    } finally {
                      setUploadingWallpaper(false);
                    }
                    return;
                  }

                  // 原生端：沿用 ImagePicker 选图，再按 uri 上传
                  const { status } =
                    await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (status !== 'granted') {
                    Alert.alert('提示', '需要相册权限才能选择图片');
                    return;
                  }
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [9, 19],
                    quality: 0.9,
                  });
                  if (result.canceled) return;
                  const asset = result.assets?.[0];
                  const uri = asset?.uri;
                  if (!uri) return;

                  setUploadingWallpaper(true);
                  try {
                    // 确保图片前缀已缓存，便于 object_key 拼完整访问链接
                    await fetchImageUrlPrefix().catch(() => '');
                    const fileName =
                      asset?.fileName ??
                      `wallpaper_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`;
                    const mimeType = asset?.mimeType ?? 'image/jpeg';
                    const uploadRes = await uploadAvatarFile(
                      user?.token || '',
                      {
                        uri,
                        name: fileName,
                        type: mimeType,
                      },
                      { compress: true }
                    );
                    if (!uploadRes?.imageId) {
                      Alert.alert('上传失败', '图片上传失败，请稍后重试');
                      return;
                    }
                    const url = buildImageUrlFromKey(uploadRes.imageId);
                    const displayUri = uploadRes.localUri ?? url;
                    if (!displayUri) {
                      Alert.alert('上传失败', '未获取到可访问的图片链接');
                      return;
                    }
                    setWallpaperUri(displayUri);
                  } finally {
                    setUploadingWallpaper(false);
                  }
                } catch {
                  // ignore
                }
              }}
            />
          )}
          <RowItem
            icon={
              <Ionicons
                name="notifications-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="消息通知"
            showArrow={false}
            right={
              <Switch
                value={notifyEnabled}
                onValueChange={(value) => {
                  setNotifyEnabled(value);
                  setJPushEnabled(value);
                }}
                trackColor={{ false: '#e2e8f0', true: theme.wechatGreen }}
                thumbColor="#fff"
              />
            }
          />
          <RowItem
            icon={
              <Ionicons
                name="trash-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="清除缓存"
            onPress={clearCache}
          />
          <RowItem
            icon={
              <Ionicons
                name="refresh-outline"
                size={22}
                color={theme.textSecondary}
              />
            }
            label="检查版本更新"
            onPress={checkForUpdate}
            showArrow={!checkingUpdate}
            right={
              checkingUpdate ? (
                <ActivityIndicator size="small" color={theme.pink} />
              ) : undefined
            }
          />
          {user?.phone === '13476120058' && (
            <RowItem
              icon={
                <Ionicons
                  name="chatbubbles-outline"
                  size={22}
                  color={theme.textSecondary}
                />
              }
              label="测试推送"
              onPress={sendJPushLocalNotification}
            />
          )}
          {/* <RowItem
          icon={
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={theme.textSecondary}
            />
          }
          label="关于我们"
          onPress={() => setAboutModalVisible(true)}
        /> */}
        </View>

        {/* 退出登录 */}
        <TouchableOpacity
          style={styles.logoutRow}
          onPress={onLogout}
          activeOpacity={0.7}
        >
          <Ionicons
            name="log-out-outline"
            size={22}
            color={theme.navTitlePink}
          />
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>

        {/* 底部版本与标语 */}
        <View style={styles.footer}>
          <Text style={styles.version}>wowwoo v{APP_VERSION}</Text>
          <Text style={styles.slogan}>你想说的话，wowwoo都在听</Text>
        </View>
      </ScrollView>

      <Modal
        visible={nicknameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setNicknameModalVisible(false)}
          />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>修改昵称</Text>
            <TextInput
              style={styles.modalInput}
              value={editingNickname}
              onChangeText={setEditingNickname}
              placeholder="请输入昵称"
              placeholderTextColor={theme.pinkPlaceholder}
              maxLength={20}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setNicknameModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnOk}
                onPress={saveNickname}
                disabled={savingNickname}
              >
                {savingNickname ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnOkText}>保存</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ComingSoonModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
      />
      <ComingSoonModal
        visible={aboutModalVisible}
        onClose={() => setAboutModalVisible(false)}
      />
      {/* 已是最新版本提示弹窗 */}
      <Modal
        visible={latestVersionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLatestVersionModalVisible(false)}
      >
        <View style={styles.updateMask}>
          <View style={styles.updateCard}>
            <Text style={styles.updateTitle}>检查更新</Text>
            <Text style={styles.updateText}>当前已是最新版本</Text>
            <View style={styles.updateButtonsRow}>
              <TouchableOpacity
                style={[styles.updateButton, styles.updateButtonPrimary]}
                activeOpacity={0.85}
                onPress={() => setLatestVersionModalVisible(false)}
              >
                <Text style={styles.updateButtonPrimaryText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* 版本更新弹窗（复用自动更新样式） */}
      <Modal
        visible={updateModalVisible && !!updateInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <View style={styles.updateMask}>
          <View style={styles.updateCard}>
            <Text style={styles.updateTitle}>
              发现新版本 v{updateInfo?.version}
            </Text>
            <Text style={styles.updateText}>
              {Platform.OS === 'web'
                ? '检测到有新的 Android 客户端版本，建议刷新浏览器或前往下载最新安装包。'
                : '检测到有新的 Android 客户端版本，可以前往下载并安装最新 APK。'}
            </Text>
            <Text style={styles.updateUrl} numberOfLines={2}>
              下载链接：{updateInfo?.url}
            </Text>
            <View style={styles.updateButtonsRow}>
              {Platform.OS === 'web' ? (
                <>
                  <TouchableOpacity
                    style={styles.updateButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      setUpdateModalVisible(false);
                      if (typeof window !== 'undefined' && window.location) {
                        window.location.reload();
                      }
                    }}
                  >
                    <Text style={styles.updateButtonText}>刷新浏览器</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.updateButton, styles.updateButtonPrimary]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setUpdateModalVisible(false);
                      if (updateInfo?.url) {
                        Linking.openURL(updateInfo.url).catch(() => {});
                      }
                    }}
                  >
                    <Text style={styles.updateButtonPrimaryText}>前往下载</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.updateButton}
                    activeOpacity={0.85}
                    onPress={() => setUpdateModalVisible(false)}
                  >
                    <Text style={styles.updateButtonText}>稍后再说</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.updateButton, styles.updateButtonPrimary]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setUpdateModalVisible(false);
                      if (updateInfo?.url) {
                        Linking.openURL(updateInfo.url).catch(() => {});
                      }
                    }}
                  >
                    <Text style={styles.updateButtonPrimaryText}>立即下载</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {/* AI 模型配置弹窗 */}
      <Modal
        visible={apiConfigModalVisible}
        animationType="slide"
        onRequestClose={() => setApiConfigModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.prefModalContainer}
        >
          <View style={[styles.prefHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => setApiConfigModalVisible(false)}
              style={styles.prefHeaderBack}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={24} color={theme.pink} />
            </TouchableOpacity>
            <Text style={styles.prefHeaderTitle}>AI 模型配置</Text>
            <TouchableOpacity
              onPress={saveApiConfig}
              disabled={preferencesSaving || preferencesLoading}
              style={styles.prefHeaderSave}
              hitSlop={12}
            >
              {preferencesSaving ? (
                <ActivityIndicator size="small" color={theme.wechatGreen} />
              ) : (
                <Text style={styles.prefHeaderSaveText}>保存</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.prefScroll}
            contentContainerStyle={styles.prefScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {preferencesLoading ? (
              <View style={styles.prefLoading}>
                <ActivityIndicator size="large" color={theme.pink} />
              </View>
            ) : (
              <View style={styles.prefCard}>
                <Text
                  style={[
                    styles.prefSectionTitle,
                    styles.prefSectionTitleFirst,
                  ]}
                >
                  AI 服务地址与 Token
                </Text>
                <TextInput
                  style={styles.prefInput}
                  value={apiConfig.base_url}
                  onChangeText={(t) =>
                    setApiConfig((c) => ({ ...c, base_url: t }))
                  }
                  placeholder="请输入 AI 服务 Base URL，例如：https://api.xxx.com"
                  placeholderTextColor={theme.pinkPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.prefInput}
                  value={apiConfig.token}
                  onChangeText={(t) =>
                    setApiConfig((c) => ({ ...c, token: t }))
                  }
                  placeholder="请输入 Token（仅保存在当前账号配置中）"
                  placeholderTextColor={theme.pinkPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.prefSectionTitle]}>模型选择</Text>
                <View style={styles.apiModelRow}>
                  <TextInput
                    style={[styles.prefInput, styles.apiModelInput]}
                    value={apiConfig.model}
                    onChangeText={(t) =>
                      setApiConfig((c) => ({ ...c, model: t }))
                    }
                    placeholder="请选择或输入模型名称"
                    placeholderTextColor={theme.pinkPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.apiModelFetchBtn}
                    onPress={fetchModels}
                    disabled={modelsLoading}
                    activeOpacity={0.8}
                  >
                    {modelsLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.apiModelFetchBtnText}>获取模型</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {modelsError ? (
                  <Text style={styles.apiModelError}>{modelsError}</Text>
                ) : null}
                {models.length > 0 && (
                  <ScrollView
                    style={styles.apiModelList}
                    contentContainerStyle={styles.apiModelListContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {models.map((m) => {
                      const active = apiConfig.model === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.apiModelTag,
                            active && styles.apiModelTagActive,
                          ]}
                          onPress={() =>
                            setApiConfig((c) => ({ ...c, model: m }))
                          }
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.apiModelTagText,
                              active && styles.apiModelTagTextActive,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={lingyaoModalVisible}
        animationType="slide"
        onRequestClose={() => setLingyaoModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.prefModalContainer}
        >
          <View style={[styles.prefHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => setLingyaoModalVisible(false)}
              style={styles.prefHeaderBack}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={24} color={theme.pink} />
            </TouchableOpacity>
            <Text style={styles.prefHeaderTitle}>api 平台代充值</Text>
            <TouchableOpacity
              onPress={() => refreshLingyaoInfo(true, true)}
              disabled={lingyaoLoading || lingyaoActionLoading === 'apiKey'}
              style={styles.prefHeaderSave}
              hitSlop={12}
            >
              {lingyaoActionLoading === 'apiKey' ? (
                <ActivityIndicator size="small" color={theme.wechatGreen} />
              ) : (
                <Text style={styles.prefHeaderSaveText}>刷新</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.prefScroll}
            contentContainerStyle={styles.prefScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {lingyaoLoading ? (
              <View style={styles.prefLoading}>
                <ActivityIndicator size="large" color={theme.pink} />
              </View>
            ) : (
              <>
                <View style={styles.prefCardInner}>
                  <Text
                    style={[
                      styles.prefSectionTitle,
                      styles.prefSectionTitleFirst,
                    ]}
                  >
                    绑定状态
                  </Text>
                  <View style={styles.lingyaoStatusRow}>
                    <View
                      style={[
                        styles.lingyaoStatusBadge,
                        lingyaoBound && styles.lingyaoStatusBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.lingyaoStatusBadgeText,
                          lingyaoBound && styles.lingyaoStatusBadgeTextActive,
                        ]}
                      >
                        {lingyaoBound ? '已绑定' : '未绑定'}
                      </Text>
                    </View>
                    {lingyaoInfo?.base_url ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() =>
                          Linking.openURL(lingyaoInfo.base_url).catch(() => {})
                        }
                      >
                        <Text style={styles.lingyaoLinkText}>打开api 平台</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.lingyaoHint}>
                    {lingyaoBound
                      ? '绑定成功后可查看自己的 API Key，并直接发起代充值。'
                      : '你可以先注册新api 平台账号，也可以直接绑定已有api 平台账号。'}
                  </Text>
                  <Text style={styles.lingyaoFieldLabel}>账号</Text>
                  <Text
                    selectable
                    style={[
                      styles.lingyaoFieldValue,
                      !lingyaoInfo?.username &&
                        styles.lingyaoFieldValuePlaceholder,
                    ]}
                  >
                    {lingyaoInfo?.username || '暂未绑定'}
                  </Text>
                  <Text style={styles.lingyaoFieldLabel}>Base URL</Text>
                  <Text
                    selectable
                    style={[
                      styles.lingyaoFieldValue,
                      !lingyaoInfo?.base_url &&
                        styles.lingyaoFieldValuePlaceholder,
                    ]}
                  >
                    {lingyaoInfo?.base_url || '绑定后自动获取'}
                  </Text>
                  <View style={styles.lingyaoFieldHeader}>
                    <Text style={styles.lingyaoFieldLabel}>API Key</Text>
                    {lingyaoInfo?.api_key ? (
                      <View style={styles.lingyaoFieldActions}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() =>
                            setShowLingyaoApiKey((visible) => !visible)
                          }
                          style={styles.lingyaoCopyButton}
                        >
                          <Ionicons
                            name={
                              showLingyaoApiKey
                                ? 'eye-off-outline'
                                : 'eye-outline'
                            }
                            size={14}
                            color={theme.btnPrimaryBg}
                          />
                          <Text style={styles.lingyaoCopyButtonText}>
                            {showLingyaoApiKey ? '隐藏' : '显示'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={handleCopyLingyaoApiKey}
                          style={styles.lingyaoCopyButton}
                        >
                          <Ionicons
                            name="copy-outline"
                            size={14}
                            color={theme.btnPrimaryBg}
                          />
                          <Text style={styles.lingyaoCopyButtonText}>复制</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    selectable
                    style={[
                      styles.lingyaoFieldValue,
                      !lingyaoInfo?.api_key &&
                        !lingyaoInfo?.api_key_masked &&
                        styles.lingyaoFieldValuePlaceholder,
                    ]}
                  >
                    {lingyaoInfo?.api_key
                      ? showLingyaoApiKey
                        ? lingyaoInfo.api_key
                        : maskApiKey(lingyaoInfo.api_key)
                      : lingyaoInfo?.api_key_masked ||
                        '绑定后点击右上角“刷新”获取'}
                  </Text>
                </View>

                {lingyaoBound ? (
                  <View
                    style={[styles.prefCardInner, styles.lingyaoSectionSpacing]}
                  >
                    <Text
                      style={[
                        styles.prefSectionTitle,
                        styles.prefSectionTitleFirst,
                      ]}
                    >
                      快捷操作
                    </Text>
                    <Text style={styles.lingyaoHint}>
                      支持把api 平台的 Base URL、API Key
                      和默认模型一键导入到当前账号的 AI 配置中。
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.lingyaoActionButton,
                        lingyaoActionLoading === 'import' &&
                          styles.lingyaoActionButtonDisabled,
                      ]}
                      activeOpacity={0.85}
                      onPress={handleImportLingyaoApiConfig}
                      disabled={lingyaoActionLoading !== null}
                    >
                      {lingyaoActionLoading === 'import' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.lingyaoActionButtonText}>
                          一键导入 API 配置
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.lingyaoDangerButton,
                        lingyaoActionLoading === 'unbind' &&
                          styles.lingyaoActionButtonDisabled,
                      ]}
                      activeOpacity={0.85}
                      onPress={handleLingyaoUnbind}
                      disabled={lingyaoActionLoading !== null}
                    >
                      {lingyaoActionLoading === 'unbind' ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.navTitlePink}
                        />
                      ) : (
                        <Text style={styles.lingyaoDangerButtonText}>
                          解绑api 平台账号
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View
                      style={[
                        styles.prefCardInner,
                        styles.lingyaoSectionSpacing,
                      ]}
                    >
                      <Text
                        style={[
                          styles.prefSectionTitle,
                          styles.prefSectionTitleFirst,
                        ]}
                      >
                        注册并绑定api 平台账号
                      </Text>
                      <TextInput
                        style={styles.prefInput}
                        value={lingyaoRegisterForm.username}
                        onChangeText={(t) =>
                          setLingyaoRegisterForm((form) => ({
                            ...form,
                            username: t,
                          }))
                        }
                        placeholder="请输入api 平台账号"
                        placeholderTextColor={theme.pinkPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TextInput
                        style={styles.prefInput}
                        value={lingyaoRegisterForm.password}
                        onChangeText={(t) =>
                          setLingyaoRegisterForm((form) => ({
                            ...form,
                            password: t,
                          }))
                        }
                        placeholder="请输入api 平台密码"
                        placeholderTextColor={theme.pinkPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                      />
                      <Text style={styles.lingyaoPasswordHint}>
                        密码需至少 8 位，且必须同时包含字母和数字
                      </Text>
                      <TextInput
                        style={styles.prefInput}
                        value={lingyaoRegisterForm.invite_code}
                        onChangeText={(t) =>
                          setLingyaoRegisterForm((form) => ({
                            ...form,
                            invite_code: t,
                          }))
                        }
                        placeholder="请输入邀请码，没有可留空"
                        placeholderTextColor={theme.pinkPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={[
                          styles.lingyaoActionButton,
                          lingyaoActionLoading === 'register' &&
                            styles.lingyaoActionButtonDisabled,
                        ]}
                        activeOpacity={0.85}
                        onPress={handleLingyaoRegister}
                        disabled={lingyaoActionLoading !== null}
                      >
                        {lingyaoActionLoading === 'register' ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.lingyaoActionButtonText}>
                            注册并尝试自动绑定
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    <View
                      style={[
                        styles.prefCardInner,
                        styles.lingyaoSectionSpacing,
                      ]}
                    >
                      <Text
                        style={[
                          styles.prefSectionTitle,
                          styles.prefSectionTitleFirst,
                        ]}
                      >
                        绑定已有api 平台账号
                      </Text>
                      <TextInput
                        style={styles.prefInput}
                        value={lingyaoLoginForm.username}
                        onChangeText={(t) =>
                          setLingyaoLoginForm((form) => ({
                            ...form,
                            username: t,
                          }))
                        }
                        placeholder="请输入已有api 平台账号"
                        placeholderTextColor={theme.pinkPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TextInput
                        style={styles.prefInput}
                        value={lingyaoLoginForm.password}
                        onChangeText={(t) =>
                          setLingyaoLoginForm((form) => ({
                            ...form,
                            password: t,
                          }))
                        }
                        placeholder="请输入api 平台密码"
                        placeholderTextColor={theme.pinkPlaceholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                      />
                      <TouchableOpacity
                        style={[
                          styles.lingyaoActionButton,
                          lingyaoActionLoading === 'login' &&
                            styles.lingyaoActionButtonDisabled,
                        ]}
                        activeOpacity={0.85}
                        onPress={handleLingyaoLogin}
                        disabled={lingyaoActionLoading !== null}
                      >
                        {lingyaoActionLoading === 'login' ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.lingyaoActionButtonText}>
                            绑定已有账号
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <View
                  style={[styles.prefCardInner, styles.lingyaoSectionSpacing]}
                >
                  <Text
                    style={[
                      styles.prefSectionTitle,
                      styles.prefSectionTitleFirst,
                    ]}
                  >
                    代充值
                  </Text>
                  <Text style={styles.lingyaoHint}>
                    当前将为api 平台账号 {lingyaoInfo?.username || '未绑定账号'}{' '}
                    发起充值。
                  </Text>
                  <TextInput
                    style={styles.prefInput}
                    value={lingyaoAmount}
                    onChangeText={(t) =>
                      setLingyaoAmount(t.replace(/[^\d]/g, ''))
                    }
                    placeholder="请输入充值金额，单位元"
                    placeholderTextColor={theme.pinkPlaceholder}
                    keyboardType="number-pad"
                  />
                  <View style={styles.lingyaoPaymentRow}>
                    {(
                      [
                        ['alipay', '支付宝'],
                        ['wxpay', '微信支付'],
                      ] as const
                    ).map(([value, label]) => {
                      const active = lingyaoPaymentMethod === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          style={[
                            styles.lingyaoPaymentButton,
                            active && styles.lingyaoPaymentButtonActive,
                          ]}
                          onPress={() => setLingyaoPaymentMethod(value)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.lingyaoPaymentButtonText,
                              active && styles.lingyaoPaymentButtonTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.lingyaoActionButton,
                      (!lingyaoBound || lingyaoActionLoading === 'recharge') &&
                        styles.lingyaoActionButtonDisabled,
                    ]}
                    activeOpacity={0.85}
                    onPress={handleLingyaoRecharge}
                    disabled={!lingyaoBound || lingyaoActionLoading !== null}
                  >
                    {lingyaoActionLoading === 'recharge' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.lingyaoActionButtonText}>
                        发起充值
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={lingyaoRedirecting}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.lingyaoRedirectOverlay}>
          <View style={styles.lingyaoRedirectCard}>
            <ActivityIndicator size="large" color={theme.btnPrimaryBg} />
            <Text style={styles.lingyaoRedirectTitle}>正在跳转支付页面</Text>
            <Text style={styles.lingyaoRedirectText}>
              请稍候，正在提交订单并等待页面跳转
            </Text>
          </View>
        </View>
      </Modal>
      {/* 偏好设置弹窗 */}
      <Modal
        visible={preferenceModalVisible}
        animationType="slide"
        onRequestClose={() => setPreferenceModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.prefModalContainer}
        >
          <View style={[styles.prefHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => setPreferenceModalVisible(false)}
              style={styles.prefHeaderBack}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={24} color={theme.pink} />
            </TouchableOpacity>
            <Text style={styles.prefHeaderTitle}>偏好设置</Text>
            <TouchableOpacity
              onPress={savePreferences}
              disabled={preferencesSaving || preferencesLoading}
              style={styles.prefHeaderSave}
              hitSlop={12}
            >
              {preferencesSaving ? (
                <ActivityIndicator size="small" color={theme.wechatGreen} />
              ) : (
                <Text style={styles.prefHeaderSaveText}>保存</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.prefScroll}
            contentContainerStyle={styles.prefScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {preferencesLoading ? (
              <View style={styles.prefLoading}>
                <ActivityIndicator size="large" color={theme.pink} />
              </View>
            ) : (
              <View style={styles.prefCard}>
                <Text
                  style={[
                    styles.prefSectionTitle,
                    styles.prefSectionTitleFirst,
                  ]}
                >
                  头像
                </Text>
                <View style={styles.prefAvatarRow}>
                  <TouchableOpacity
                    style={styles.prefAvatarPress}
                    onPress={pickAvatar}
                    activeOpacity={0.8}
                    disabled={uploadingAvatar}
                  >
                    {avatarUri ? (
                      <PreviewableImage
                        source={{ uri: avatarUri }}
                        style={styles.prefAvatar}
                        accessibilityLabel="个人头像"
                      />
                    ) : (
                      <View style={styles.prefAvatarPlaceholder}>
                        <Text style={styles.prefAvatarPlaceholderText}>
                          未设置
                        </Text>
                      </View>
                    )}
                    {uploadingAvatar && (
                      <View
                        style={[
                          styles.avatarOverlay,
                          styles.prefAvatarOverlaySize,
                        ]}
                      >
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.prefAvatarBtn}
                    onPress={pickAvatar}
                    activeOpacity={0.8}
                    disabled={uploadingAvatar}
                  >
                    <Text style={styles.prefAvatarBtnText}>
                      {uploadingAvatar ? '上传中...' : '更换头像'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.prefSectionTitle]}>身份标签</Text>
                <TextInput
                  style={styles.prefInput}
                  value={preferences.identity_tags}
                  onChangeText={(t) =>
                    setPreferences((p) => ({ ...p, identity_tags: t }))
                  }
                  placeholder="请输入身份标签，如：学生、职场人"
                  placeholderTextColor={theme.pinkPlaceholder}
                />

                <Text style={styles.prefSectionTitle}>兴趣爱好</Text>
                <TextInput
                  style={styles.prefInput}
                  value={preferences.interests}
                  onChangeText={(t) =>
                    setPreferences((p) => ({ ...p, interests: t }))
                  }
                  placeholder="请输入兴趣爱好，如：学习、运动、音乐"
                  placeholderTextColor={theme.pinkPlaceholder}
                />

                <Text style={styles.prefSectionTitle}>喜欢的聊天风格</Text>
                <TextInput
                  style={styles.prefInput}
                  value={preferences.chat_style}
                  onChangeText={(t) =>
                    setPreferences((p) => ({ ...p, chat_style: t }))
                  }
                  placeholder="请输入喜欢的聊天风格，如：温柔、幽默"
                  placeholderTextColor={theme.pinkPlaceholder}
                />

                <Text style={styles.prefSectionTitle}>基本信息</Text>
                <View style={styles.prefBasicRow}>
                  <Text style={styles.prefBasicLabel}>年龄</Text>
                  <TextInput
                    style={styles.prefInputSmall}
                    value={preferences.age}
                    onChangeText={(t) =>
                      setPreferences((p) => ({ ...p, age: t }))
                    }
                    placeholder="请输入年龄"
                    placeholderTextColor={theme.pinkPlaceholder}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.prefBasicRow}>
                  <Text style={styles.prefBasicLabel}>性别</Text>
                  <View style={styles.prefGenderRow}>
                    {(
                      [
                        ['female', '女'],
                        ['male', '男'],
                        // ["secret", "保密"],
                      ] as const
                    ).map(([val, label]) => (
                      <TouchableOpacity
                        key={val}
                        style={[
                          styles.prefGenderBtn,
                          preferences.gender === val &&
                            styles.prefGenderBtnActive,
                        ]}
                        onPress={() =>
                          setPreferences((p) => ({
                            ...p,
                            gender: val,
                          }))
                        }
                      >
                        <Text
                          style={[
                            styles.prefGenderBtnText,
                            preferences.gender === val &&
                              styles.prefGenderBtnTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {/* <View style={styles.prefBasicRow}>
                  <Text style={styles.prefBasicLabel}>星座</Text>
                  <TouchableOpacity
                    style={styles.prefInputSmall}
                    onPress={() => setConstellationPickerVisible(true)}
                  >
                    <Text
                      style={
                        preferences.constellation
                          ? styles.prefConstellationText
                          : styles.prefConstellationPlaceholder
                      }
                    >
                      {preferences.constellation || "请选择星座"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={theme.textMuted}
                      style={styles.prefConstellationArrow}
                    />
                  </TouchableOpacity>
                </View> */}

                <Text style={styles.prefSectionTitle}>禁忌话题</Text>
                <TextInput
                  style={styles.prefInput}
                  value={preferences.forbidden_topics}
                  onChangeText={(t) =>
                    setPreferences((p) => ({ ...p, forbidden_topics: t }))
                  }
                  placeholder="请输入禁忌话题，用逗号分隔，如：恐怖故事,前任"
                  placeholderTextColor={theme.pinkPlaceholder}
                />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* 星座选择弹层：与偏好设置 Modal 平级，避免 Android 上嵌套 Modal 导致 "child already has a parent" */}
      <Modal
        visible={constellationPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConstellationPickerVisible(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setConstellationPickerVisible(false)}
        >
          <Pressable style={styles.pickerBox} onPress={() => {}}>
            <Text style={styles.pickerTitle}>选择星座</Text>
            <ScrollView
              style={styles.pickerScroll}
              keyboardShouldPersistTaps="handled"
            >
              {CONSTELLATIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={styles.pickerItem}
                  onPress={() => {
                    setPreferences((p) => ({ ...p, constellation: c }));
                    setConstellationPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      preferences.constellation === c &&
                        styles.pickerItemTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.pageBg,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  headerRightBtn: {
    padding: 8,
    marginRight: 4,
  },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowLight,
  },
  prefCard: {
    marginTop: 50,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.pinkLight,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 2,
    borderColor: theme.pinkLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarOverlaySize: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  nickname: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  gridIconWrap: {
    padding: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  listRowFirst: {
    borderTopWidth: 0,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: theme.textPrimary,
    marginLeft: 4,
  },
  rowRight: {
    marginLeft: 8,
  },
  lingyaoInlineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  lingyaoInlineBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.wechatGreen,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 16,
    color: theme.navTitlePink,
    fontWeight: '500',
    marginLeft: 10,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
    alignItems: 'center',
  },
  version: {
    fontSize: 13,
    color: theme.textMuted,
  },
  slogan: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBox: {
    width: '84%',
    maxWidth: 320,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 16,
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusMd,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtnCancel: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radiusMd,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
  },
  modalBtnCancelText: {
    color: theme.navTitlePink,
    fontSize: 16,
  },
  modalBtnOk: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radiusMd,
    backgroundColor: theme.btnPrimaryBg,
  },
  modalBtnOkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // 偏好设置弹窗
  prefModalContainer: {
    flex: 1,
    backgroundColor: theme.pageBg,
  },
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.cardBg,
  },
  prefHeaderBack: {
    padding: 4,
  },
  prefHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.navTitlePink,
  },
  prefHeaderSave: {
    minWidth: 56,
    alignItems: 'flex-end',
  },
  prefHeaderSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.btnPrimaryBg,
  },
  lingyaoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  lingyaoStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
  },
  lingyaoStatusBadgeActive: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  lingyaoStatusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.navTitlePink,
  },
  lingyaoStatusBadgeTextActive: {
    color: theme.wechatGreen,
  },
  lingyaoLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.btnPrimaryBg,
  },
  lingyaoHint: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  lingyaoPasswordHint: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
    marginTop: -4,
    marginBottom: 10,
  },
  lingyaoFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: 6,
  },
  lingyaoFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  lingyaoFieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  lingyaoCopyButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    marginBottom: 8,
  },
  lingyaoCopyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.btnPrimaryBg,
  },
  lingyaoFieldValue: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.textPrimary,
    marginBottom: 12,
  },
  lingyaoFieldValuePlaceholder: {
    color: theme.pinkPlaceholder,
  },
  lingyaoSectionSpacing: {
    marginTop: 16,
  },
  lingyaoActionButton: {
    height: 46,
    borderRadius: theme.radiusMd,
    backgroundColor: theme.btnPrimaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  lingyaoActionButtonDisabled: {
    opacity: 0.6,
  },
  lingyaoActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  lingyaoDangerButton: {
    height: 46,
    borderRadius: theme.radiusMd,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  lingyaoDangerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.navTitlePink,
  },
  lingyaoRedirectOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.24)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  lingyaoRedirectCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: theme.radiusLg,
    backgroundColor: theme.cardBg,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowLight,
  },
  lingyaoRedirectTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: 14,
  },
  lingyaoRedirectText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  prefScroll: {
    flex: 1,
  },
  prefScrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  prefLoading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  prefCardInner: {
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowLight,
  },
  prefSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
  prefSectionTitleFirst: {
    marginTop: 0,
  },
  prefAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  prefAvatarPress: {
    position: 'relative',
  },
  prefAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.pinkLight,
  },
  prefAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 2,
    borderColor: theme.pinkLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prefAvatarPlaceholderText: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  prefAvatarOverlaySize: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  prefAvatarBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: theme.btnPrimaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prefAvatarBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  prefInput: {
    height: 48,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    borderRadius: theme.radiusMd,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: 4,
  },
  prefBasicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  prefBasicLabel: {
    fontSize: 16,
    color: theme.textPrimary,
    width: 64,
  },
  prefInputSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    borderRadius: theme.radiusMd,
    paddingHorizontal: 16,
  },
  prefConstellationText: {
    fontSize: 16,
    color: theme.textPrimary,
    flex: 1,
  },
  prefConstellationPlaceholder: {
    fontSize: 16,
    color: theme.pinkPlaceholder,
    flex: 1,
  },
  prefConstellationArrow: {
    marginLeft: 8,
  },
  prefGenderRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  prefGenderBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: theme.pinkLight,
  },
  prefGenderBtnActive: {
    backgroundColor: theme.btnPrimaryBg,
    borderColor: theme.btnPrimaryBg,
  },
  prefGenderBtnText: {
    fontSize: 15,
    color: theme.navTitlePink,
  },
  prefGenderBtnTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  apiModelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  apiModelInput: {
    flex: 1,
    marginBottom: 0,
  },
  apiModelFetchBtn: {
    marginLeft: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: theme.btnPrimaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apiModelFetchBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  apiModelError: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 13,
    color: theme.navTitlePink,
  },
  apiModelList: {
    marginTop: 4,
    marginBottom: 8,
    maxHeight: 220,
  },
  apiModelListContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  apiModelTag: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    backgroundColor: theme.pinkBgTag,
    marginRight: 8,
    marginBottom: 8,
  },
  apiModelTagActive: {
    backgroundColor: theme.btnPrimaryBg,
    borderColor: theme.btnPrimaryBg,
  },
  apiModelTagText: {
    fontSize: 13,
    color: theme.navTitlePink,
  },
  apiModelTagTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  lingyaoPaymentRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 6,
  },
  lingyaoPaymentButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.pinkLight,
    backgroundColor: theme.pinkBgTag,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lingyaoPaymentButtonActive: {
    backgroundColor: theme.btnPrimaryBg,
    borderColor: theme.btnPrimaryBg,
  },
  lingyaoPaymentButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.navTitlePink,
  },
  lingyaoPaymentButtonTextActive: {
    color: '#fff',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerBox: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    maxHeight: 360,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerScroll: {
    maxHeight: 300,
  },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pickerItemText: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  pickerItemTextActive: {
    color: theme.btnPrimaryBg,
    fontWeight: '600',
  },
  updateMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  updateCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    ...theme.bubbleShadow,
  },
  updateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
    lineHeight: 24,
  },
  updateText: {
    marginTop: 8,
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  updateUrl: {
    marginTop: 8,
    fontSize: 12,
    color: theme.textMuted,
  },
  updateButtonsRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  updateButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(165,63,104,0.06)',
  },
  updateButtonPrimary: {
    backgroundColor: theme.wechatGreen,
  },
  updateButtonText: {
    fontSize: 14,
    color: theme.navTitlePink,
  },
  updateButtonPrimaryText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
