import{r as P,p as De,a as zt,x as Vt,u as Wt,X as Ut,j as a,A as Z,ax as Kt,b as qt,N as ke,ae as Gt,ay as U,aw as Jt,ak as Yt,aj as Xt,H as K,B as Ne,az as je,m as Qt,aA as Zt,n as en,c as tn,R as nn,aB as rn,aC as sn,a2 as on,aD as an,aE as cn}from"./index-B7WG_kHJ-1769026461592.js";import{c as ln,L as dn}from"./Layout-BnB1agDJ-1769026461592.js";import{T as ee}from"./Toggle-B6i1zhXp-1769026461592.js";import{m}from"./motion-DSM7Rpg2-1769026461592.js";import"./index-yirOBEcN-1769026461592.js";import"./useTranslation-CnXjuBvM-1769026461592.js";import"./responsive-BJrBEfWo-1769026461592.js";import"./omniapiApi-DDnppdd_-1769026461592.js";const un=()=>{};var Re={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qe=function(e){const t=[];let n=0;for(let i=0;i<e.length;i++){let r=e.charCodeAt(i);r<128?t[n++]=r:r<2048?(t[n++]=r>>6|192,t[n++]=r&63|128):(r&64512)===55296&&i+1<e.length&&(e.charCodeAt(i+1)&64512)===56320?(r=65536+((r&1023)<<10)+(e.charCodeAt(++i)&1023),t[n++]=r>>18|240,t[n++]=r>>12&63|128,t[n++]=r>>6&63|128,t[n++]=r&63|128):(t[n++]=r>>12|224,t[n++]=r>>6&63|128,t[n++]=r&63|128)}return t},fn=function(e){const t=[];let n=0,i=0;for(;n<e.length;){const r=e[n++];if(r<128)t[i++]=String.fromCharCode(r);else if(r>191&&r<224){const s=e[n++];t[i++]=String.fromCharCode((r&31)<<6|s&63)}else if(r>239&&r<365){const s=e[n++],o=e[n++],d=e[n++],u=((r&7)<<18|(s&63)<<12|(o&63)<<6|d&63)-65536;t[i++]=String.fromCharCode(55296+(u>>10)),t[i++]=String.fromCharCode(56320+(u&1023))}else{const s=e[n++],o=e[n++];t[i++]=String.fromCharCode((r&15)<<12|(s&63)<<6|o&63)}}return t.join("")},Ze={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(e,t){if(!Array.isArray(e))throw Error("encodeByteArray takes an array as a parameter");this.init_();const n=t?this.byteToCharMapWebSafe_:this.byteToCharMap_,i=[];for(let r=0;r<e.length;r+=3){const s=e[r],o=r+1<e.length,d=o?e[r+1]:0,u=r+2<e.length,c=u?e[r+2]:0,b=s>>2,A=(s&3)<<4|d>>4;let S=(d&15)<<2|c>>6,_=c&63;u||(_=64,o||(S=64)),i.push(n[b],n[A],n[S],n[_])}return i.join("")},encodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?btoa(e):this.encodeByteArray(Qe(e),t)},decodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?atob(e):fn(this.decodeStringToByteArray(e,t))},decodeStringToByteArray(e,t){this.init_();const n=t?this.charToByteMapWebSafe_:this.charToByteMap_,i=[];for(let r=0;r<e.length;){const s=n[e.charAt(r++)],d=r<e.length?n[e.charAt(r)]:0;++r;const c=r<e.length?n[e.charAt(r)]:64;++r;const A=r<e.length?n[e.charAt(r)]:64;if(++r,s==null||d==null||c==null||A==null)throw new pn;const S=s<<2|d>>4;if(i.push(S),c!==64){const _=d<<4&240|c>>2;if(i.push(_),A!==64){const V=c<<6&192|A;i.push(V)}}}return i},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let e=0;e<this.ENCODED_VALS.length;e++)this.byteToCharMap_[e]=this.ENCODED_VALS.charAt(e),this.charToByteMap_[this.byteToCharMap_[e]]=e,this.byteToCharMapWebSafe_[e]=this.ENCODED_VALS_WEBSAFE.charAt(e),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[e]]=e,e>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(e)]=e,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(e)]=e)}}};class pn extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const hn=function(e){const t=Qe(e);return Ze.encodeByteArray(t,!0)},et=function(e){return hn(e).replace(/\./g,"")},gn=function(e){try{return Ze.decodeString(e,!0)}catch(t){console.error("base64Decode failed: ",t)}return null};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function mn(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const bn=()=>mn().__FIREBASE_DEFAULTS__,yn=()=>{if(typeof process>"u"||typeof Re>"u")return;const e=Re.__FIREBASE_DEFAULTS__;if(e)return JSON.parse(e)},wn=()=>{if(typeof document>"u")return;let e;try{e=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const t=e&&gn(e[1]);return t&&JSON.parse(t)},xn=()=>{try{return un()||bn()||yn()||wn()}catch(e){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${e}`);return}},tt=()=>{var e;return(e=xn())==null?void 0:e.config};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class In{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((t,n)=>{this.resolve=t,this.reject=n})}wrapCallback(t){return(n,i)=>{n?this.reject(n):this.resolve(i),typeof t=="function"&&(this.promise.catch(()=>{}),t.length===1?t(n):t(n,i))}}}function nt(){try{return typeof indexedDB=="object"}catch{return!1}}function it(){return new Promise((e,t)=>{try{let n=!0;const i="validate-browser-context-for-indexeddb-analytics-module",r=self.indexedDB.open(i);r.onsuccess=()=>{r.result.close(),n||self.indexedDB.deleteDatabase(i),e(!0)},r.onupgradeneeded=()=>{n=!1},r.onerror=()=>{var s;t(((s=r.error)==null?void 0:s.message)||"")}}catch(n){t(n)}})}function Sn(){return!(typeof navigator>"u"||!navigator.cookieEnabled)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const En="FirebaseError";class O extends Error{constructor(t,n,i){super(n),this.code=t,this.customData=i,this.name=En,Object.setPrototypeOf(this,O.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,J.prototype.create)}}class J{constructor(t,n,i){this.service=t,this.serviceName=n,this.errors=i}create(t,...n){const i=n[0]||{},r=`${this.service}/${t}`,s=this.errors[t],o=s?vn(s,i):"Error",d=`${this.serviceName}: ${o} (${r}).`;return new O(r,d,i)}}function vn(e,t){return e.replace(Tn,(n,i)=>{const r=t[i];return r!=null?String(r):`<${i}?>`})}const Tn=/\{\$([^}]+)}/g;function ue(e,t){if(e===t)return!0;const n=Object.keys(e),i=Object.keys(t);for(const r of n){if(!i.includes(r))return!1;const s=e[r],o=t[r];if(Oe(s)&&Oe(o)){if(!ue(s,o))return!1}else if(s!==o)return!1}for(const r of i)if(!n.includes(r))return!1;return!0}function Oe(e){return e!==null&&typeof e=="object"}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ye(e){return e&&e._delegate?e._delegate:e}class T{constructor(t,n,i){this.name=t,this.instanceFactory=n,this.type=i,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(t){return this.instantiationMode=t,this}setMultipleInstances(t){return this.multipleInstances=t,this}setServiceProps(t){return this.serviceProps=t,this}setInstanceCreatedCallback(t){return this.onInstanceCreated=t,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const C="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class An{constructor(t,n){this.name=t,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(t){const n=this.normalizeInstanceIdentifier(t);if(!this.instancesDeferred.has(n)){const i=new In;if(this.instancesDeferred.set(n,i),this.isInitialized(n)||this.shouldAutoInitialize())try{const r=this.getOrInitializeService({instanceIdentifier:n});r&&i.resolve(r)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(t){const n=this.normalizeInstanceIdentifier(t==null?void 0:t.identifier),i=(t==null?void 0:t.optional)??!1;if(this.isInitialized(n)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:n})}catch(r){if(i)return null;throw r}else{if(i)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(t){if(t.name!==this.name)throw Error(`Mismatching Component ${t.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=t,!!this.shouldAutoInitialize()){if(Cn(t))try{this.getOrInitializeService({instanceIdentifier:C})}catch{}for(const[n,i]of this.instancesDeferred.entries()){const r=this.normalizeInstanceIdentifier(n);try{const s=this.getOrInitializeService({instanceIdentifier:r});i.resolve(s)}catch{}}}}clearInstance(t=C){this.instancesDeferred.delete(t),this.instancesOptions.delete(t),this.instances.delete(t)}async delete(){const t=Array.from(this.instances.values());await Promise.all([...t.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...t.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(t=C){return this.instances.has(t)}getOptions(t=C){return this.instancesOptions.get(t)||{}}initialize(t={}){const{options:n={}}=t,i=this.normalizeInstanceIdentifier(t.instanceIdentifier);if(this.isInitialized(i))throw Error(`${this.name}(${i}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const r=this.getOrInitializeService({instanceIdentifier:i,options:n});for(const[s,o]of this.instancesDeferred.entries()){const d=this.normalizeInstanceIdentifier(s);i===d&&o.resolve(r)}return r}onInit(t,n){const i=this.normalizeInstanceIdentifier(n),r=this.onInitCallbacks.get(i)??new Set;r.add(t),this.onInitCallbacks.set(i,r);const s=this.instances.get(i);return s&&t(s,i),()=>{r.delete(t)}}invokeOnInitCallbacks(t,n){const i=this.onInitCallbacks.get(n);if(i)for(const r of i)try{r(t,n)}catch{}}getOrInitializeService({instanceIdentifier:t,options:n={}}){let i=this.instances.get(t);if(!i&&this.component&&(i=this.component.instanceFactory(this.container,{instanceIdentifier:_n(t),options:n}),this.instances.set(t,i),this.instancesOptions.set(t,n),this.invokeOnInitCallbacks(i,t),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,t,i)}catch{}return i||null}normalizeInstanceIdentifier(t=C){return this.component?this.component.multipleInstances?t:C:t}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function _n(e){return e===C?void 0:e}function Cn(e){return e.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Dn{constructor(t){this.name=t,this.providers=new Map}addComponent(t){const n=this.getProvider(t.name);if(n.isComponentSet())throw new Error(`Component ${t.name} has already been registered with ${this.name}`);n.setComponent(t)}addOrOverwriteComponent(t){this.getProvider(t.name).isComponentSet()&&this.providers.delete(t.name),this.addComponent(t)}getProvider(t){if(this.providers.has(t))return this.providers.get(t);const n=new An(t,this);return this.providers.set(t,n),n}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var f;(function(e){e[e.DEBUG=0]="DEBUG",e[e.VERBOSE=1]="VERBOSE",e[e.INFO=2]="INFO",e[e.WARN=3]="WARN",e[e.ERROR=4]="ERROR",e[e.SILENT=5]="SILENT"})(f||(f={}));const kn={debug:f.DEBUG,verbose:f.VERBOSE,info:f.INFO,warn:f.WARN,error:f.ERROR,silent:f.SILENT},Nn=f.INFO,jn={[f.DEBUG]:"log",[f.VERBOSE]:"log",[f.INFO]:"info",[f.WARN]:"warn",[f.ERROR]:"error"},Rn=(e,t,...n)=>{if(t<e.logLevel)return;const i=new Date().toISOString(),r=jn[t];if(r)console[r](`[${i}]  ${e.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${t})`)};class On{constructor(t){this.name=t,this._logLevel=Nn,this._logHandler=Rn,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(t){if(!(t in f))throw new TypeError(`Invalid value "${t}" assigned to \`logLevel\``);this._logLevel=t}setLogLevel(t){this._logLevel=typeof t=="string"?kn[t]:t}get logHandler(){return this._logHandler}set logHandler(t){if(typeof t!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=t}get userLogHandler(){return this._userLogHandler}set userLogHandler(t){this._userLogHandler=t}debug(...t){this._userLogHandler&&this._userLogHandler(this,f.DEBUG,...t),this._logHandler(this,f.DEBUG,...t)}log(...t){this._userLogHandler&&this._userLogHandler(this,f.VERBOSE,...t),this._logHandler(this,f.VERBOSE,...t)}info(...t){this._userLogHandler&&this._userLogHandler(this,f.INFO,...t),this._logHandler(this,f.INFO,...t)}warn(...t){this._userLogHandler&&this._userLogHandler(this,f.WARN,...t),this._logHandler(this,f.WARN,...t)}error(...t){this._userLogHandler&&this._userLogHandler(this,f.ERROR,...t),this._logHandler(this,f.ERROR,...t)}}const Mn=(e,t)=>t.some(n=>e instanceof n);let Me,$e;function $n(){return Me||(Me=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function Bn(){return $e||($e=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const rt=new WeakMap,fe=new WeakMap,st=new WeakMap,te=new WeakMap,we=new WeakMap;function Pn(e){const t=new Promise((n,i)=>{const r=()=>{e.removeEventListener("success",s),e.removeEventListener("error",o)},s=()=>{n(x(e.result)),r()},o=()=>{i(e.error),r()};e.addEventListener("success",s),e.addEventListener("error",o)});return t.then(n=>{n instanceof IDBCursor&&rt.set(n,e)}).catch(()=>{}),we.set(t,e),t}function Ln(e){if(fe.has(e))return;const t=new Promise((n,i)=>{const r=()=>{e.removeEventListener("complete",s),e.removeEventListener("error",o),e.removeEventListener("abort",o)},s=()=>{n(),r()},o=()=>{i(e.error||new DOMException("AbortError","AbortError")),r()};e.addEventListener("complete",s),e.addEventListener("error",o),e.addEventListener("abort",o)});fe.set(e,t)}let pe={get(e,t,n){if(e instanceof IDBTransaction){if(t==="done")return fe.get(e);if(t==="objectStoreNames")return e.objectStoreNames||st.get(e);if(t==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return x(e[t])},set(e,t,n){return e[t]=n,!0},has(e,t){return e instanceof IDBTransaction&&(t==="done"||t==="store")?!0:t in e}};function Fn(e){pe=e(pe)}function Hn(e){return e===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(t,...n){const i=e.call(ne(this),t,...n);return st.set(i,t.sort?t.sort():[t]),x(i)}:Bn().includes(e)?function(...t){return e.apply(ne(this),t),x(rt.get(this))}:function(...t){return x(e.apply(ne(this),t))}}function zn(e){return typeof e=="function"?Hn(e):(e instanceof IDBTransaction&&Ln(e),Mn(e,$n())?new Proxy(e,pe):e)}function x(e){if(e instanceof IDBRequest)return Pn(e);if(te.has(e))return te.get(e);const t=zn(e);return t!==e&&(te.set(e,t),we.set(t,e)),t}const ne=e=>we.get(e);function Y(e,t,{blocked:n,upgrade:i,blocking:r,terminated:s}={}){const o=indexedDB.open(e,t),d=x(o);return i&&o.addEventListener("upgradeneeded",u=>{i(x(o.result),u.oldVersion,u.newVersion,x(o.transaction),u)}),n&&o.addEventListener("blocked",u=>n(u.oldVersion,u.newVersion,u)),d.then(u=>{s&&u.addEventListener("close",()=>s()),r&&u.addEventListener("versionchange",c=>r(c.oldVersion,c.newVersion,c))}).catch(()=>{}),d}function ie(e,{blocked:t}={}){const n=indexedDB.deleteDatabase(e);return t&&n.addEventListener("blocked",i=>t(i.oldVersion,i)),x(n).then(()=>{})}const Vn=["get","getKey","getAll","getAllKeys","count"],Wn=["put","add","delete","clear"],re=new Map;function Be(e,t){if(!(e instanceof IDBDatabase&&!(t in e)&&typeof t=="string"))return;if(re.get(t))return re.get(t);const n=t.replace(/FromIndex$/,""),i=t!==n,r=Wn.includes(n);if(!(n in(i?IDBIndex:IDBObjectStore).prototype)||!(r||Vn.includes(n)))return;const s=async function(o,...d){const u=this.transaction(o,r?"readwrite":"readonly");let c=u.store;return i&&(c=c.index(d.shift())),(await Promise.all([c[n](...d),r&&u.done]))[0]};return re.set(t,s),s}Fn(e=>({...e,get:(t,n,i)=>Be(t,n)||e.get(t,n,i),has:(t,n)=>!!Be(t,n)||e.has(t,n)}));/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Un{constructor(t){this.container=t}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(Kn(n)){const i=n.getImmediate();return`${i.library}/${i.version}`}else return null}).filter(n=>n).join(" ")}}function Kn(e){const t=e.getComponent();return(t==null?void 0:t.type)==="VERSION"}const he="@firebase/app",Pe="0.14.6";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const I=new On("@firebase/app"),qn="@firebase/app-compat",Gn="@firebase/analytics-compat",Jn="@firebase/analytics",Yn="@firebase/app-check-compat",Xn="@firebase/app-check",Qn="@firebase/auth",Zn="@firebase/auth-compat",ei="@firebase/database",ti="@firebase/data-connect",ni="@firebase/database-compat",ii="@firebase/functions",ri="@firebase/functions-compat",si="@firebase/installations",oi="@firebase/installations-compat",ai="@firebase/messaging",ci="@firebase/messaging-compat",li="@firebase/performance",di="@firebase/performance-compat",ui="@firebase/remote-config",fi="@firebase/remote-config-compat",pi="@firebase/storage",hi="@firebase/storage-compat",gi="@firebase/firestore",mi="@firebase/ai",bi="@firebase/firestore-compat",yi="firebase";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ge="[DEFAULT]",wi={[he]:"fire-core",[qn]:"fire-core-compat",[Jn]:"fire-analytics",[Gn]:"fire-analytics-compat",[Xn]:"fire-app-check",[Yn]:"fire-app-check-compat",[Qn]:"fire-auth",[Zn]:"fire-auth-compat",[ei]:"fire-rtdb",[ti]:"fire-data-connect",[ni]:"fire-rtdb-compat",[ii]:"fire-fn",[ri]:"fire-fn-compat",[si]:"fire-iid",[oi]:"fire-iid-compat",[ai]:"fire-fcm",[ci]:"fire-fcm-compat",[li]:"fire-perf",[di]:"fire-perf-compat",[ui]:"fire-rc",[fi]:"fire-rc-compat",[pi]:"fire-gcs",[hi]:"fire-gcs-compat",[gi]:"fire-fst",[bi]:"fire-fst-compat",[mi]:"fire-vertex","fire-js":"fire-js",[yi]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const q=new Map,xi=new Map,me=new Map;function Le(e,t){try{e.container.addComponent(t)}catch(n){I.debug(`Component ${t.name} failed to register with FirebaseApp ${e.name}`,n)}}function k(e){const t=e.name;if(me.has(t))return I.debug(`There were multiple attempts to register component ${t}.`),!1;me.set(t,e);for(const n of q.values())Le(n,e);for(const n of xi.values())Le(n,e);return!0}function xe(e,t){const n=e.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),e.container.getProvider(t)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ii={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},E=new J("app","Firebase",Ii);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Si{constructor(t,n,i){this._isDeleted=!1,this._options={...t},this._config={...n},this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=i,this.container.addComponent(new T("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(t){this.checkDestroyed(),this._automaticDataCollectionEnabled=t}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(t){this._isDeleted=t}checkDestroyed(){if(this.isDeleted)throw E.create("app-deleted",{appName:this._name})}}function ot(e,t={}){let n=e;typeof t!="object"&&(t={name:t});const i={name:ge,automaticDataCollectionEnabled:!0,...t},r=i.name;if(typeof r!="string"||!r)throw E.create("bad-app-name",{appName:String(r)});if(n||(n=tt()),!n)throw E.create("no-options");const s=q.get(r);if(s){if(ue(n,s.options)&&ue(i,s.config))return s;throw E.create("duplicate-app",{appName:r})}const o=new Dn(r);for(const u of me.values())o.addComponent(u);const d=new Si(n,i,o);return q.set(r,d),d}function Ei(e=ge){const t=q.get(e);if(!t&&e===ge&&tt())return ot();if(!t)throw E.create("no-app",{appName:e});return t}function v(e,t,n){let i=wi[e]??e;n&&(i+=`-${n}`);const r=i.match(/\s|\//),s=t.match(/\s|\//);if(r||s){const o=[`Unable to register library "${i}" with version "${t}":`];r&&o.push(`library name "${i}" contains illegal characters (whitespace or "/")`),r&&s&&o.push("and"),s&&o.push(`version name "${t}" contains illegal characters (whitespace or "/")`),I.warn(o.join(" "));return}k(new T(`${i}-version`,()=>({library:i,version:t}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const vi="firebase-heartbeat-database",Ti=1,L="firebase-heartbeat-store";let se=null;function at(){return se||(se=Y(vi,Ti,{upgrade:(e,t)=>{switch(t){case 0:try{e.createObjectStore(L)}catch(n){console.warn(n)}}}}).catch(e=>{throw E.create("idb-open",{originalErrorMessage:e.message})})),se}async function Ai(e){try{const n=(await at()).transaction(L),i=await n.objectStore(L).get(ct(e));return await n.done,i}catch(t){if(t instanceof O)I.warn(t.message);else{const n=E.create("idb-get",{originalErrorMessage:t==null?void 0:t.message});I.warn(n.message)}}}async function Fe(e,t){try{const i=(await at()).transaction(L,"readwrite");await i.objectStore(L).put(t,ct(e)),await i.done}catch(n){if(n instanceof O)I.warn(n.message);else{const i=E.create("idb-set",{originalErrorMessage:n==null?void 0:n.message});I.warn(i.message)}}}function ct(e){return`${e.name}!${e.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const _i=1024,Ci=30;class Di{constructor(t){this.container=t,this._heartbeatsCache=null;const n=this.container.getProvider("app").getImmediate();this._storage=new Ni(n),this._heartbeatsCachePromise=this._storage.read().then(i=>(this._heartbeatsCache=i,i))}async triggerHeartbeat(){var t,n;try{const r=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),s=He();if(((t=this._heartbeatsCache)==null?void 0:t.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((n=this._heartbeatsCache)==null?void 0:n.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===s||this._heartbeatsCache.heartbeats.some(o=>o.date===s))return;if(this._heartbeatsCache.heartbeats.push({date:s,agent:r}),this._heartbeatsCache.heartbeats.length>Ci){const o=ji(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(o,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(i){I.warn(i)}}async getHeartbeatsHeader(){var t;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((t=this._heartbeatsCache)==null?void 0:t.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const n=He(),{heartbeatsToSend:i,unsentEntries:r}=ki(this._heartbeatsCache.heartbeats),s=et(JSON.stringify({version:2,heartbeats:i}));return this._heartbeatsCache.lastSentHeartbeatDate=n,r.length>0?(this._heartbeatsCache.heartbeats=r,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),s}catch(n){return I.warn(n),""}}}function He(){return new Date().toISOString().substring(0,10)}function ki(e,t=_i){const n=[];let i=e.slice();for(const r of e){const s=n.find(o=>o.agent===r.agent);if(s){if(s.dates.push(r.date),ze(n)>t){s.dates.pop();break}}else if(n.push({agent:r.agent,dates:[r.date]}),ze(n)>t){n.pop();break}i=i.slice(1)}return{heartbeatsToSend:n,unsentEntries:i}}class Ni{constructor(t){this.app=t,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return nt()?it().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const n=await Ai(this.app);return n!=null&&n.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(t){if(await this._canUseIndexedDBPromise){const i=await this.read();return Fe(this.app,{lastSentHeartbeatDate:t.lastSentHeartbeatDate??i.lastSentHeartbeatDate,heartbeats:t.heartbeats})}else return}async add(t){if(await this._canUseIndexedDBPromise){const i=await this.read();return Fe(this.app,{lastSentHeartbeatDate:t.lastSentHeartbeatDate??i.lastSentHeartbeatDate,heartbeats:[...i.heartbeats,...t.heartbeats]})}else return}}function ze(e){return et(JSON.stringify({version:2,heartbeats:e})).length}function ji(e){if(e.length===0)return-1;let t=0,n=e[0].date;for(let i=1;i<e.length;i++)e[i].date<n&&(n=e[i].date,t=i);return t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ri(e){k(new T("platform-logger",t=>new Un(t),"PRIVATE")),k(new T("heartbeat",t=>new Di(t),"PRIVATE")),v(he,Pe,e),v(he,Pe,"esm2020"),v("fire-js","")}Ri("");var Oi="firebase",Mi="12.7.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */v(Oi,Mi,"app");const lt="@firebase/installations",Ie="0.6.19";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const dt=1e4,ut=`w:${Ie}`,ft="FIS_v2",$i="https://firebaseinstallations.googleapis.com/v1",Bi=60*60*1e3,Pi="installations",Li="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Fi={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},N=new J(Pi,Li,Fi);function pt(e){return e instanceof O&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ht({projectId:e}){return`${$i}/projects/${e}/installations`}function gt(e){return{token:e.token,requestStatus:2,expiresIn:zi(e.expiresIn),creationTime:Date.now()}}async function mt(e,t){const i=(await t.json()).error;return N.create("request-failed",{requestName:e,serverCode:i.code,serverMessage:i.message,serverStatus:i.status})}function bt({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function Hi(e,{refreshToken:t}){const n=bt(e);return n.append("Authorization",Vi(t)),n}async function yt(e){const t=await e();return t.status>=500&&t.status<600?e():t}function zi(e){return Number(e.replace("s","000"))}function Vi(e){return`${ft} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Wi({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const i=ht(e),r=bt(e),s=t.getImmediate({optional:!0});if(s){const c=await s.getHeartbeatsHeader();c&&r.append("x-firebase-client",c)}const o={fid:n,authVersion:ft,appId:e.appId,sdkVersion:ut},d={method:"POST",headers:r,body:JSON.stringify(o)},u=await yt(()=>fetch(i,d));if(u.ok){const c=await u.json();return{fid:c.fid||n,registrationStatus:2,refreshToken:c.refreshToken,authToken:gt(c.authToken)}}else throw await mt("Create Installation",u)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function wt(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ui(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ki=/^[cdef][\w-]{21}$/,be="";function qi(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=Gi(e);return Ki.test(n)?n:be}catch{return be}}function Gi(e){return Ui(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function X(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xt=new Map;function It(e,t){const n=X(e);St(n,t),Ji(n,t)}function St(e,t){const n=xt.get(e);if(n)for(const i of n)i(t)}function Ji(e,t){const n=Yi();n&&n.postMessage({key:e,fid:t}),Xi()}let D=null;function Yi(){return!D&&"BroadcastChannel"in self&&(D=new BroadcastChannel("[Firebase] FID Change"),D.onmessage=e=>{St(e.data.key,e.data.fid)}),D}function Xi(){xt.size===0&&D&&(D.close(),D=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qi="firebase-installations-database",Zi=1,j="firebase-installations-store";let oe=null;function Se(){return oe||(oe=Y(Qi,Zi,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(j)}}})),oe}async function G(e,t){const n=X(e),r=(await Se()).transaction(j,"readwrite"),s=r.objectStore(j),o=await s.get(n);return await s.put(t,n),await r.done,(!o||o.fid!==t.fid)&&It(e,t.fid),t}async function Et(e){const t=X(e),i=(await Se()).transaction(j,"readwrite");await i.objectStore(j).delete(t),await i.done}async function Q(e,t){const n=X(e),r=(await Se()).transaction(j,"readwrite"),s=r.objectStore(j),o=await s.get(n),d=t(o);return d===void 0?await s.delete(n):await s.put(d,n),await r.done,d&&(!o||o.fid!==d.fid)&&It(e,d.fid),d}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ee(e){let t;const n=await Q(e.appConfig,i=>{const r=er(i),s=tr(e,r);return t=s.registrationPromise,s.installationEntry});return n.fid===be?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function er(e){const t=e||{fid:qi(),registrationStatus:0};return vt(t)}function tr(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const r=Promise.reject(N.create("app-offline"));return{installationEntry:t,registrationPromise:r}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},i=nr(e,n);return{installationEntry:n,registrationPromise:i}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:ir(e)}:{installationEntry:t}}async function nr(e,t){try{const n=await Wi(e,t);return G(e.appConfig,n)}catch(n){throw pt(n)&&n.customData.serverCode===409?await Et(e.appConfig):await G(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function ir(e){let t=await Ve(e.appConfig);for(;t.registrationStatus===1;)await wt(100),t=await Ve(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:i}=await Ee(e);return i||n}return t}function Ve(e){return Q(e,t=>{if(!t)throw N.create("installation-not-found");return vt(t)})}function vt(e){return rr(e)?{fid:e.fid,registrationStatus:0}:e}function rr(e){return e.registrationStatus===1&&e.registrationTime+dt<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function sr({appConfig:e,heartbeatServiceProvider:t},n){const i=or(e,n),r=Hi(e,n),s=t.getImmediate({optional:!0});if(s){const c=await s.getHeartbeatsHeader();c&&r.append("x-firebase-client",c)}const o={installation:{sdkVersion:ut,appId:e.appId}},d={method:"POST",headers:r,body:JSON.stringify(o)},u=await yt(()=>fetch(i,d));if(u.ok){const c=await u.json();return gt(c)}else throw await mt("Generate Auth Token",u)}function or(e,{fid:t}){return`${ht(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ve(e,t=!1){let n;const i=await Q(e.appConfig,s=>{if(!Tt(s))throw N.create("not-registered");const o=s.authToken;if(!t&&lr(o))return s;if(o.requestStatus===1)return n=ar(e,t),s;{if(!navigator.onLine)throw N.create("app-offline");const d=ur(s);return n=cr(e,d),d}});return n?await n:i.authToken}async function ar(e,t){let n=await We(e.appConfig);for(;n.authToken.requestStatus===1;)await wt(100),n=await We(e.appConfig);const i=n.authToken;return i.requestStatus===0?ve(e,t):i}function We(e){return Q(e,t=>{if(!Tt(t))throw N.create("not-registered");const n=t.authToken;return fr(n)?{...t,authToken:{requestStatus:0}}:t})}async function cr(e,t){try{const n=await sr(e,t),i={...t,authToken:n};return await G(e.appConfig,i),n}catch(n){if(pt(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await Et(e.appConfig);else{const i={...t,authToken:{requestStatus:0}};await G(e.appConfig,i)}throw n}}function Tt(e){return e!==void 0&&e.registrationStatus===2}function lr(e){return e.requestStatus===2&&!dr(e)}function dr(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+Bi}function ur(e){const t={requestStatus:1,requestTime:Date.now()};return{...e,authToken:t}}function fr(e){return e.requestStatus===1&&e.requestTime+dt<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function pr(e){const t=e,{installationEntry:n,registrationPromise:i}=await Ee(t);return i?i.catch(console.error):ve(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function hr(e,t=!1){const n=e;return await gr(n),(await ve(n,t)).token}async function gr(e){const{registrationPromise:t}=await Ee(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function mr(e){if(!e||!e.options)throw ae("App Configuration");if(!e.name)throw ae("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw ae(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function ae(e){return N.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const At="installations",br="installations-internal",yr=e=>{const t=e.getProvider("app").getImmediate(),n=mr(t),i=xe(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:i,_delete:()=>Promise.resolve()}},wr=e=>{const t=e.getProvider("app").getImmediate(),n=xe(t,At).getImmediate();return{getId:()=>pr(n),getToken:r=>hr(n,r)}};function xr(){k(new T(At,yr,"PUBLIC")),k(new T(br,wr,"PRIVATE"))}xr();v(lt,Ie);v(lt,Ie,"esm2020");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ir="/firebase-messaging-sw.js",Sr="/firebase-cloud-messaging-push-scope",_t="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",Er="https://fcmregistrations.googleapis.com/v1",Ct="google.c.a.c_id",vr="google.c.a.c_l",Tr="google.c.a.ts",Ar="google.c.a.e",Ue=1e4;var Ke;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(Ke||(Ke={}));/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */var F;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked"})(F||(F={}));/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function w(e){const t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function _r(e){const t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),i=atob(n),r=new Uint8Array(i.length);for(let s=0;s<i.length;++s)r[s]=i.charCodeAt(s);return r}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ce="fcm_token_details_db",Cr=5,qe="fcm_token_object_Store";async function Dr(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(s=>s.name).includes(ce))return null;let t=null;return(await Y(ce,Cr,{upgrade:async(i,r,s,o)=>{if(r<2||!i.objectStoreNames.contains(qe))return;const d=o.objectStore(qe),u=await d.index("fcmSenderId").get(e);if(await d.clear(),!!u){if(r===2){const c=u;if(!c.auth||!c.p256dh||!c.endpoint)return;t={token:c.fcmToken,createTime:c.createTime??Date.now(),subscriptionOptions:{auth:c.auth,p256dh:c.p256dh,endpoint:c.endpoint,swScope:c.swScope,vapidKey:typeof c.vapidKey=="string"?c.vapidKey:w(c.vapidKey)}}}else if(r===3){const c=u;t={token:c.fcmToken,createTime:c.createTime,subscriptionOptions:{auth:w(c.auth),p256dh:w(c.p256dh),endpoint:c.endpoint,swScope:c.swScope,vapidKey:w(c.vapidKey)}}}else if(r===4){const c=u;t={token:c.fcmToken,createTime:c.createTime,subscriptionOptions:{auth:w(c.auth),p256dh:w(c.p256dh),endpoint:c.endpoint,swScope:c.swScope,vapidKey:w(c.vapidKey)}}}}}})).close(),await ie(ce),await ie("fcm_vapid_details_db"),await ie("undefined"),kr(t)?t:null}function kr(e){if(!e||!e.subscriptionOptions)return!1;const{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Nr="firebase-messaging-database",jr=1,H="firebase-messaging-store";let le=null;function Dt(){return le||(le=Y(Nr,jr,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(H)}}})),le}async function Rr(e){const t=kt(e),i=await(await Dt()).transaction(H).objectStore(H).get(t);if(i)return i;{const r=await Dr(e.appConfig.senderId);if(r)return await Te(e,r),r}}async function Te(e,t){const n=kt(e),r=(await Dt()).transaction(H,"readwrite");return await r.objectStore(H).put(t,n),await r.done,t}function kt({appConfig:e}){return e.appId}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Or={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used."},p=new J("messaging","Messaging",Or);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Mr(e,t){const n=await _e(e),i=Nt(t),r={method:"POST",headers:n,body:JSON.stringify(i)};let s;try{s=await(await fetch(Ae(e.appConfig),r)).json()}catch(o){throw p.create("token-subscribe-failed",{errorInfo:o==null?void 0:o.toString()})}if(s.error){const o=s.error.message;throw p.create("token-subscribe-failed",{errorInfo:o})}if(!s.token)throw p.create("token-subscribe-no-token");return s.token}async function $r(e,t){const n=await _e(e),i=Nt(t.subscriptionOptions),r={method:"PATCH",headers:n,body:JSON.stringify(i)};let s;try{s=await(await fetch(`${Ae(e.appConfig)}/${t.token}`,r)).json()}catch(o){throw p.create("token-update-failed",{errorInfo:o==null?void 0:o.toString()})}if(s.error){const o=s.error.message;throw p.create("token-update-failed",{errorInfo:o})}if(!s.token)throw p.create("token-update-no-token");return s.token}async function Br(e,t){const i={method:"DELETE",headers:await _e(e)};try{const s=await(await fetch(`${Ae(e.appConfig)}/${t}`,i)).json();if(s.error){const o=s.error.message;throw p.create("token-unsubscribe-failed",{errorInfo:o})}}catch(r){throw p.create("token-unsubscribe-failed",{errorInfo:r==null?void 0:r.toString()})}}function Ae({projectId:e}){return`${Er}/projects/${e}/registrations`}async function _e({appConfig:e,installations:t}){const n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function Nt({p256dh:e,auth:t,endpoint:n,vapidKey:i}){const r={web:{endpoint:n,auth:t,p256dh:e}};return i!==_t&&(r.web.applicationPubKey=i),r}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Pr=7*24*60*60*1e3;async function Lr(e){const t=await Hr(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:w(t.getKey("auth")),p256dh:w(t.getKey("p256dh"))},i=await Rr(e.firebaseDependencies);if(i){if(zr(i.subscriptionOptions,n))return Date.now()>=i.createTime+Pr?Fr(e,{token:i.token,createTime:Date.now(),subscriptionOptions:n}):i.token;try{await Br(e.firebaseDependencies,i.token)}catch(r){console.warn(r)}return Ge(e.firebaseDependencies,n)}else return Ge(e.firebaseDependencies,n)}async function Fr(e,t){try{const n=await $r(e.firebaseDependencies,t),i={...t,token:n,createTime:Date.now()};return await Te(e.firebaseDependencies,i),n}catch(n){throw n}}async function Ge(e,t){const i={token:await Mr(e,t),createTime:Date.now(),subscriptionOptions:t};return await Te(e,i),i.token}async function Hr(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:_r(t)})}function zr(e,t){const n=t.vapidKey===e.vapidKey,i=t.endpoint===e.endpoint,r=t.auth===e.auth,s=t.p256dh===e.p256dh;return n&&i&&r&&s}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Je(e){const t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return Vr(t,e),Wr(t,e),Ur(t,e),t}function Vr(e,t){if(!t.notification)return;e.notification={};const n=t.notification.title;n&&(e.notification.title=n);const i=t.notification.body;i&&(e.notification.body=i);const r=t.notification.image;r&&(e.notification.image=r);const s=t.notification.icon;s&&(e.notification.icon=s)}function Wr(e,t){t.data&&(e.data=t.data)}function Ur(e,t){var r,s,o,d;if(!t.fcmOptions&&!((r=t.notification)!=null&&r.click_action))return;e.fcmOptions={};const n=((s=t.fcmOptions)==null?void 0:s.link)??((o=t.notification)==null?void 0:o.click_action);n&&(e.fcmOptions.link=n);const i=(d=t.fcmOptions)==null?void 0:d.analytics_label;i&&(e.fcmOptions.analyticsLabel=i)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Kr(e){return typeof e=="object"&&!!e&&Ct in e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qr(e){if(!e||!e.options)throw de("App Configuration Object");if(!e.name)throw de("App Name");const t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(const i of t)if(!n[i])throw de(i);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function de(e){return p.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Gr{constructor(t,n,i){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.logEvents=[],this.isLogServiceStarted=!1;const r=qr(t);this.firebaseDependencies={app:t,appConfig:r,installations:n,analyticsProvider:i}}_delete(){return Promise.resolve()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Jr(e){try{e.swRegistration=await navigator.serviceWorker.register(Ir,{scope:Sr}),e.swRegistration.update().catch(()=>{}),await Yr(e.swRegistration)}catch(t){throw p.create("failed-service-worker-registration",{browserErrorMessage:t==null?void 0:t.message})}}async function Yr(e){return new Promise((t,n)=>{const i=setTimeout(()=>n(new Error(`Service worker not registered after ${Ue} ms`)),Ue),r=e.installing||e.waiting;e.active?(clearTimeout(i),t()):r?r.onstatechange=s=>{var o;((o=s.target)==null?void 0:o.state)==="activated"&&(r.onstatechange=null,clearTimeout(i),t())}:(clearTimeout(i),n(new Error("No incoming service worker found.")))})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Xr(e,t){if(!t&&!e.swRegistration&&await Jr(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw p.create("invalid-sw-registration");e.swRegistration=t}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Qr(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=_t)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function jt(e,t){if(!navigator)throw p.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw p.create("permission-blocked");return await Qr(e,t==null?void 0:t.vapidKey),await Xr(e,t==null?void 0:t.serviceWorkerRegistration),Lr(e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Zr(e,t,n){const i=es(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(i,{message_id:n[Ct],message_name:n[vr],message_time:n[Tr],message_device_time:Math.floor(Date.now()/1e3)})}function es(e){switch(e){case F.NOTIFICATION_CLICKED:return"notification_open";case F.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ts(e,t){const n=t.data;if(!n.isFirebaseMessaging)return;e.onMessageHandler&&n.messageType===F.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(Je(n)):e.onMessageHandler.next(Je(n)));const i=n.data;Kr(i)&&i[Ar]==="1"&&await Zr(e,n.messageType,i)}const Ye="@firebase/messaging",Xe="0.12.23";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ns=e=>{const t=new Gr(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>ts(t,n)),t},is=e=>{const t=e.getProvider("messaging").getImmediate();return{getToken:i=>jt(t,i)}};function rs(){k(new T("messaging",ns,"PUBLIC")),k(new T("messaging-internal",is,"PRIVATE")),v(Ye,Xe),v(Ye,Xe,"esm2020")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ss(){try{await it()}catch{return!1}return typeof window<"u"&&nt()&&Sn()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function os(e,t){if(!navigator)throw p.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function as(e=Ei()){return ss().then(t=>{if(!t)throw p.create("unsupported-browser")},t=>{throw p.create("indexed-db-unsupported")}),xe(ye(e),"messaging").getImmediate()}async function cs(e,t){return e=ye(e),jt(e,t)}function ls(e,t){return e=ye(e),os(e,t)}rs();const ds={apiKey:"AIzaSyBWmY5zR2R7xyMuL1cZEnXS7JL1fbfJ2KY",authDomain:"omniapihomedomotic.firebaseapp.com",projectId:"omniapihomedomotic",storageBucket:"omniapihomedomotic.firebasestorage.app",messagingSenderId:"341304629590",appId:"1:341304629590:web:6a652c2feb23f70508def7",measurementId:"G-C5KC6N5ZR8"},us="BGxPCFAPcfhftj2c3LwuzmoEgIA8Ey6nXlZZPOwU4iF6eNseNTv5n6UcPrvlqGzW5keO3Tq2GY3OAca8QQvSbYQ",fs=ot(ds);let z=null;typeof window<"u"&&"serviceWorker"in navigator&&(z=as(fs));async function ps(){try{return z?await Notification.requestPermission()!=="granted"?(console.warn("Notification permission denied"),null):await cs(z,{vapidKey:us}):(console.warn("Firebase messaging not supported"),null)}catch(e){return console.error("Error getting notification permission:",e),null}}function hs(e){z&&ls(z,t=>{e(t)})}function gs(){const[e,t]=P.useState({permission:"default",token:null,loading:!1,error:null});P.useEffect(()=>{if(!("Notification"in window)||!("serviceWorker"in navigator)){t(r=>({...r,permission:"unsupported"}));return}t(r=>({...r,permission:Notification.permission}))},[]),P.useEffect(()=>{hs(r=>{var d,u;const s=((d=r.notification)==null?void 0:d.title)||"OmniaPi",o=((u=r.notification)==null?void 0:u.body)||"";document.hasFocus()&&Notification.permission==="granted"&&new Notification(s,{body:o,icon:"/pwa-192x192.png"})})},[]);const n=P.useCallback(async()=>{try{const r=await Notification.requestPermission();if(r!=="granted")return t(o=>({...o,permission:r,error:r==="denied"?"Notifiche bloccate. Abilita dalle impostazioni del browser.":"Permesso notifiche non concesso"})),!1;t(o=>({...o,loading:!0,error:null}));const s=await ps();return s?(await De.post("/api/notifications/register",{token:s}),t(o=>({...o,loading:!1,permission:"granted",token:s})),!0):(t(o=>({...o,loading:!1,permission:"granted",error:"Impossibile ottenere il token FCM"})),!1)}catch(r){return console.error("Error enabling notifications:",r),t(s=>({...s,loading:!1,error:"Errore durante l'attivazione delle notifiche"})),!1}},[]),i=P.useCallback(async()=>{t(r=>({...r,loading:!0,error:null}));try{return e.token&&await De.delete("/api/notifications/unregister",{data:{token:e.token}}),t(r=>({...r,loading:!1,token:null})),!0}catch(r){return console.error("Error disabling notifications:",r),t(s=>({...s,loading:!1,error:"Errore durante la disattivazione"})),!1}},[e.token]);return{...e,isSupported:e.permission!=="unsupported",isEnabled:e.permission==="granted"&&!!e.token,enableNotifications:n,disableNotifications:i}}const R={hidden:{opacity:0,y:30,scale:.95},show:{opacity:1,y:0,scale:1,transition:{duration:.4,ease:"easeOut"}}},ms={hidden:{},show:{transition:{staggerChildren:.1}}},Ts=()=>{const{user:e,logout:t}=zt(),{colorTheme:n,setColorTheme:i,colors:r,setThemeMode:s,isDarkMode:o,modeColors:d,useGradients:u,setUseGradients:c}=Vt(),b=Wt(),{isSupported:A,isEnabled:S,loading:_,error:V,enableNotifications:Rt,disableNotifications:Ot}=gs(),{isStandalone:Mt}=ln(),$t=(e==null?void 0:e.ruolo)===Ut.ADMIN,l={...d,accent:r.accent,accentLight:r.accentLight,accentDark:r.accentDark,border:`rgba(${Ce(r.accent)}, 0.15)`,borderHover:`rgba(${Ce(r.accent)}, 0.35)`},M={background:l.bgCardLit,border:`1px solid ${l.border}`,borderRadius:"20px",boxShadow:l.cardShadowLit,position:"relative",overflow:"hidden"},$={position:"absolute",top:0,left:"25%",right:"25%",height:"1px",background:`linear-gradient(90deg, transparent, ${l.accentLight}4D, transparent)`,pointerEvents:"none"};function Ce(g){const h=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(g);return h?`${parseInt(h[1],16)}, ${parseInt(h[2],16)}, ${parseInt(h[3],16)}`:"106, 212, 160"}const Bt=g=>{i(g),K.success(`Tema ${U[g].name}`)},Pt=()=>{t(),b("/login")},y=({icon:g,iconBg:h,title:B,subtitle:Lt,onClick:W,rightElement:Ft,showArrow:Ht=!0})=>a.jsxs(m.div,{onClick:W,style:{...M,padding:"10px",cursor:W?"pointer":"default"},whileHover:W?{scale:1.01}:void 0,whileTap:W?{scale:.99}:void 0,children:[a.jsx("div",{style:$}),a.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:[a.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px"},children:[a.jsx("div",{style:{padding:"8px",borderRadius:"12px",background:h},children:a.jsx(g,{size:18,style:{color:h.includes("accent")?l.accent:l.textPrimary}})}),a.jsxs("div",{children:[a.jsx("h3",{style:{fontSize:"14px",fontWeight:500,color:l.textPrimary,margin:0},children:B}),a.jsx("p",{style:{fontSize:"11px",color:l.textMuted,margin:"2px 0 0 0"},children:Lt})]})]}),Ft||Ht&&a.jsx(ke,{size:18,style:{color:l.textMuted}})]})]});return a.jsx(dn,{children:a.jsxs(m.div,{initial:"hidden",animate:"show",variants:ms,style:{display:"flex",flexDirection:"column",gap:"16px"},children:[a.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:a.jsxs("div",{children:[a.jsx("h1",{style:{fontSize:"24px",fontWeight:700,color:l.textPrimary,margin:0},children:"Impostazioni"}),a.jsxs("p",{style:{fontSize:"12px",color:l.textMuted,margin:"4px 0 0 0"},children:["v",Z]})]})}),a.jsxs(m.div,{variants:R,onClick:()=>b("/settings/profilo"),style:{...M,padding:"12px",cursor:"pointer"},whileHover:{scale:1.01},whileTap:{scale:.99},children:[a.jsx("div",{style:$}),a.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"14px"},children:[a.jsx("div",{style:{width:"52px",height:"52px",borderRadius:"50%",background:`linear-gradient(135deg, ${l.accent}30, ${l.accentDark}20)`,border:`1px solid ${l.accent}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},children:a.jsx(Kt,{size:24,style:{color:l.accent}})}),a.jsxs("div",{style:{flex:1,minWidth:0},children:[a.jsx("h3",{style:{fontSize:"16px",fontWeight:600,color:l.textPrimary,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:(e==null?void 0:e.nome)||"Utente"}),a.jsxs("p",{style:{fontSize:"12px",color:l.textMuted,margin:"4px 0 0 0",display:"flex",alignItems:"center",gap:"6px"},children:[a.jsx(qt,{size:12}),a.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:(e==null?void 0:e.email)||"email@example.com"})]}),(e==null?void 0:e.ruolo)&&a.jsx("span",{style:{display:"inline-block",marginTop:"6px",padding:"2px 8px",fontSize:"10px",fontWeight:600,color:l.accent,background:`${l.accent}15`,border:`1px solid ${l.accent}30`,borderRadius:"6px",textTransform:"uppercase"},children:e.ruolo})]}),a.jsx(ke,{size:18,style:{color:l.textMuted,flexShrink:0}})]})]}),a.jsxs(m.div,{variants:R,style:{display:"flex",flexDirection:"column",gap:"12px"},children:[a.jsx("h2",{style:{fontSize:"12px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:l.textMuted,margin:"0 0 0 4px"},children:"Aspetto"}),a.jsxs(m.div,{style:{...M,padding:"12px"},children:[a.jsx("div",{style:$}),a.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px",marginBottom:"14px"},children:[a.jsx("div",{style:{padding:"8px",borderRadius:"12px",background:`${l.accent}20`},children:a.jsx(Gt,{size:18,style:{color:l.accent}})}),a.jsxs("div",{children:[a.jsx("h3",{style:{fontSize:"14px",fontWeight:500,color:l.textPrimary,margin:0},children:"Colore Tema"}),a.jsx("p",{style:{fontSize:"11px",color:l.textMuted,margin:"2px 0 0 0"},children:U[n].name})]})]}),a.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(40px, 1fr))",gap:"10px",maxWidth:"100%"},children:Object.keys(U).map(g=>{const h=U[g],B=n===g;return a.jsxs(m.button,{onClick:()=>Bt(g),style:{width:"40px",height:"40px",borderRadius:"12px",border:B?`2px solid ${h.accent}`:"2px solid transparent",background:`linear-gradient(135deg, ${h.accent}30, ${h.accentDark}20)`,cursor:"pointer",position:"relative",overflow:"hidden",boxShadow:B?`0 0 12px ${h.accent}40`:"none"},whileHover:{scale:1.1},whileTap:{scale:.95},title:h.name,children:[a.jsx("div",{style:{position:"absolute",inset:"20%",borderRadius:"50%",background:h.accent,boxShadow:`0 0 8px ${h.accent}60`}}),B&&a.jsx(m.div,{initial:{scale:0},animate:{scale:1},style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)"},children:a.jsx(Jt,{size:14,style:{color:"#fff"}})})]},g)})})]}),a.jsxs(m.div,{style:{...M,padding:"12px"},children:[a.jsx("div",{style:$}),a.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:[a.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px"},children:[a.jsx("div",{style:{padding:"8px",borderRadius:"12px",background:o?`${l.accent}20`:`${l.warning}20`},children:o?a.jsx(Yt,{size:18,style:{color:l.accent}}):a.jsx(Xt,{size:18,style:{color:l.warning}})}),a.jsxs("div",{children:[a.jsxs("h3",{style:{fontSize:"14px",fontWeight:500,color:l.textPrimary,margin:0},children:["Modalità ",o?"Scura":"Chiara"]}),a.jsx("p",{style:{fontSize:"11px",color:l.textMuted,margin:"2px 0 0 0"},children:o?"Tema scuro attivo":"Tema chiaro attivo"})]})]}),a.jsx(ee,{isOn:o,onToggle:()=>{const g=o?"light":"dark";s(g),K.success(g==="dark"?"Tema scuro":"Tema chiaro")},size:"lg"})]})]}),a.jsxs(m.div,{style:{...M,padding:"12px"},children:[a.jsx("div",{style:$}),a.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"},children:[a.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px"},children:[a.jsx("div",{style:{padding:"8px",borderRadius:"12px",background:u?`${l.accent}20`:`${l.textMuted}20`},children:a.jsx(Ne,{size:18,style:{color:u?l.accent:l.textMuted}})}),a.jsxs("div",{children:[a.jsx("h3",{style:{fontSize:"14px",fontWeight:500,color:l.textPrimary,margin:0},children:"Usa Gradienti"}),a.jsx("p",{style:{fontSize:"11px",color:l.textMuted,margin:"2px 0 0 0"},children:"Applica effetto gradiente ai controlli"})]})]}),a.jsx(ee,{isOn:u,onToggle:()=>{c(!u),K.success(u?"Gradienti disattivati":"Gradienti attivati")},size:"lg"})]})]})]}),a.jsxs(m.div,{variants:R,children:[a.jsx("h2",{style:{fontSize:"12px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:l.textMuted,margin:"0 0 10px 4px"},children:"Account"}),a.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[A?a.jsx(y,{icon:je,iconBg:`${l.accent}20`,title:"Notifiche Push",subtitle:_?"Caricamento...":V||(S?"Attive":"Disattivate"),showArrow:!1,rightElement:_?a.jsx(Qt,{size:24,style:{color:l.accent,animation:"spin 1s linear infinite"}}):a.jsx(ee,{isOn:S,onToggle:async()=>{S?await Ot():await Rt()},size:"lg"})}):a.jsx(y,{icon:je,iconBg:`${l.textMuted}20`,title:"Notifiche Push",subtitle:"Non supportate su questo browser",showArrow:!1}),a.jsx(y,{icon:Zt,iconBg:`${l.warning}20`,title:"Dispositivi Connessi",subtitle:"Gestisci sessioni attive",onClick:()=>b("/settings/dispositivi-connessi")}),Mt&&a.jsx(y,{icon:en,iconBg:"rgba(34, 197, 94, 0.2)",title:"App Installata",subtitle:"Stai usando l'app installata",showArrow:!1})]})]}),a.jsxs(m.div,{variants:R,children:[a.jsx("h2",{style:{fontSize:"12px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:l.textMuted,margin:"0 0 10px 4px"},children:"Sicurezza"}),a.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:a.jsx(y,{icon:tn,iconBg:`${l.warning}20`,title:"Password",subtitle:"Modifica password",onClick:()=>b("/settings/password")})})]}),$t&&a.jsxs(m.div,{variants:R,children:[a.jsx("h2",{style:{fontSize:"12px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:l.textMuted,margin:"0 0 10px 4px"},children:"Amministrazione"}),a.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:a.jsx(y,{icon:nn,iconBg:`${l.error}20`,title:"Gestione Utenti",subtitle:"Amministra account utenti",onClick:()=>b("/settings/admin/utenti")})})]}),a.jsxs(m.div,{variants:R,children:[a.jsx("h2",{style:{fontSize:"12px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",color:l.textMuted,margin:"0 0 10px 4px"},children:"Informazioni"}),a.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[a.jsx(y,{icon:rn,iconBg:`${l.accent}20`,title:"Guida",subtitle:"Come usare l'app",onClick:()=>b("/settings/guida")}),a.jsx(y,{icon:sn,iconBg:`${l.accent}20`,title:"Informazioni",subtitle:`OmniaPi ${Z}`,onClick:()=>b("/settings/info")}),a.jsx(y,{icon:Ne,iconBg:`${l.accent}20`,title:"Test Animazione",subtitle:"Prova effetto WOW",onClick:()=>b("/settings/test-animation")}),a.jsx(y,{icon:on,iconBg:`${l.warning}20`,title:"Svuota Cache",subtitle:"Forza aggiornamento app",onClick:()=>{K.info("Svuoto cache e ricarico..."),an()}})]})]}),a.jsx("div",{style:{textAlign:"center",padding:"8px 0"},children:a.jsx("span",{style:{fontSize:"12px",color:l.textMuted},children:Z})}),a.jsxs(m.button,{onClick:Pt,style:{display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",padding:"14px",background:`${l.error}15`,border:`1px solid ${l.error}30`,borderRadius:"16px",color:l.error,fontSize:"14px",fontWeight:600,cursor:"pointer",marginTop:"8px"},whileHover:{scale:1.02,background:`${l.error}25`},whileTap:{scale:.98},children:[a.jsx(cn,{size:18}),"Esci dall'account"]})]})})};export{Ts as Settings};
