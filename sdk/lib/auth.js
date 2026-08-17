"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUserId = exports.onAuthStateChanged = exports.signOut = exports.signIn = void 0;
const auth_1 = __importDefault(require("@react-native-firebase/auth"));
const firebaseApp_1 = require("./firebaseApp");
// There is no signUp() here on purpose — sandbox test accounts are created
// per OEM by Coiliiot, not self-serve, to keep each OEM's test data isolated
// under its own account rather than a shared one.
const signIn = async (email, password) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const credential = await (0, auth_1.default)(app).signInWithEmailAndPassword(email, password);
    return credential.user;
};
exports.signIn = signIn;
const signOut = async () => {
    const app = (0, firebaseApp_1.getSdkApp)();
    await (0, auth_1.default)(app).signOut();
};
exports.signOut = signOut;
const onAuthStateChanged = (callback) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    return (0, auth_1.default)(app).onAuthStateChanged(callback);
};
exports.onAuthStateChanged = onAuthStateChanged;
const getCurrentUserId = () => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const user = (0, auth_1.default)(app).currentUser;
    if (!user) {
        throw new Error('Not signed in. Call signIn(email, password) first.');
    }
    return user.uid;
};
exports.getCurrentUserId = getCurrentUserId;
