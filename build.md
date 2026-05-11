# build

## 1. web

### 打包

```
npx expo export --platform web
```

### 本地调试

```
npx expo start -c
```

## 2. android

### 打包

第一步

```
npx expo prebuild --clean
```

第二步

```
npx expo run:android --variant release
```

> 打包好的app在android/app/build/outputs/apk/release下
>
> 改名为wowwoo_版本号.apk 比如wowwoo_v1.3.0.apk


### 本地调试
```
npx expo prebuild --clean
```
```
npx expo run:android
```
```
真机调试可以安装android/app/build/outputs/apk/debug下的apk,扫码本机调试(需要和电脑在同一局域网下)
```

## 3.ios

### 打包

第一步

```
npx expo prebuild --clean
```

第二步

  
需要在ios/Podfile文件中  
platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1’的下一行加上  
use_modular_headers!  


第三步

```
pod install --repo-update
```

