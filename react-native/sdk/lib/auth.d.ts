import { FirebaseAuthTypes } from '@react-native-firebase/auth';
export declare const signIn: (email: string, password: string) => Promise<FirebaseAuthTypes.User>;
export declare const signOut: () => Promise<void>;
export declare const onAuthStateChanged: (callback: (user: FirebaseAuthTypes.User | null) => void) => (() => void);
export declare const getCurrentUserId: () => string;
