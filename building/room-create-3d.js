const snap = value => Math.round(value * 2) / 2;
const floorName = floor => floor < 0 ? `B${-floor}` : `${floor}F`;

// Draft footprints live only in this controller; the store receives one room
// after a completed valid drag, so Escape never changes the saved scene.
export function createRoomCreate3D(env) {
 const {THREE, host, scene} = env;
 let active = false, gesture = null, context = null, preview = null, savedControls = null, savedCursor = '';
 const status = (message, error = false) => env.status?.(message, error);
 const notify = () => env.onChange?.();
 const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
 const cameraStamp = camera => JSON.stringify([camera.position.toArray(), camera.quaternion.toArray(), camera.projectionMatrix.elements]);
 function readContext() {
  const floor = env.floor(), height = env.floorHeight(floor), camera = env.camera();
  return {floor, height, camera, cameraStamp: cameraStamp(camera)};
 }
 function unchanged() {
  const now = readContext();
  return context && context.floor === now.floor && context.height === now.height && context.camera === now.camera && context.cameraStamp === now.cameraStamp;
 }
 function clearPreview() {
  if (!preview) return;
  scene.remove(preview);
  preview.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  preview = null;
 }
 function releasePointer() {
  const previous = gesture; gesture = null;
  if (previous && host.hasPointerCapture?.(previous.pointerId)) host.releasePointerCapture(previous.pointerId);
  clearPreview();
 }
 function finish() {
  active = false; releasePointer(); context = null;
  if (savedControls) { savedControls.controls.enabled = savedControls.enabled; savedControls = null; }
  host.style.cursor = savedCursor; notify();
 }
 function cancel(message = '已取消新增房間') {
  if (!active) return;
  finish(); status(message);
 }
 function validContext() {
  if (unchanged()) return true;
  cancel('樓層或視角已切換，已取消新增房間'); return false;
 }
 function world(event) {
  const rect = host.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), context.camera);
  const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -context.height), new THREE.Vector3());
  return point && Number.isFinite(point.x) && Number.isFinite(point.z) ? {x: snap(point.x), z: snap(point.z)} : null;
 }
 function draft(point) {
  const start = gesture.start;
  return {floor: context.floor, x: snap((start.x + point.x) / 2), z: snap((start.z + point.z) / 2), w: snap(Math.abs(point.x - start.x)), d: snap(Math.abs(point.z - start.z)), offset: 0};
 }
 function invalidReason(room) {
  if (room.w < 3 || room.d < 3) return '房間太小，請拖出至少 3 × 3 的範圍';
  if (room.w > 60 || room.d > 60) return '房間太大，長寬最多 60';
  if (Math.abs(room.x) > 100 || Math.abs(room.z) > 100) return '房間中心超出範圍，請放在 X／Z −100～100 之內';
  return '';
 }
 function draw(room, invalid) {
  clearPreview();
  const width = Math.max(.1, room.w), depth = Math.max(.1, room.d), color = invalid ? 0xff8b68 : 0x63e0e8;
  preview = new THREE.Group(); preview.name = 'room-create-preview'; preview.position.set(room.x, context.height + .12, room.z); scene.add(preview);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .28, side: THREE.DoubleSide, depthTest: false, depthWrite: false}));
  fill.rotation.x = -Math.PI / 2; fill.renderOrder = 10000; preview.add(fill);
  const corners = [[-width / 2, 0, -depth / 2], [width / 2, 0, -depth / 2], [width / 2, 0, depth / 2], [-width / 2, 0, depth / 2]];
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners.map(point => new THREE.Vector3(...point))), new THREE.LineBasicMaterial({color, depthTest: false, depthWrite: false}));
  outline.renderOrder = 10001; preview.add(outline);
 }
 function updateDraft(event) {
  const point = world(event);
  if (!point) { gesture.room = null; clearPreview(); status('這個視角無法對準樓板，請取消後調整視角再新增房間', true); return; }
  const room = draft(point), reason = invalidReason(room);
  gesture.room = room; gesture.reason = reason;
  gesture.moved ||= Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) >= 4;
  draw(room, Boolean(reason));
  status(`${floorName(room.floor)} · ${room.w} × ${room.d} · ${reason || '放開滑鼠建立房間；Esc 取消'}`, Boolean(reason));
  notify();
 }
 function start() {
  if (active) return;
  context = readContext();
  if (!Number.isInteger(context.floor) || !Number.isFinite(context.height)) { context = null; status('請先選擇要新增房間的樓層', true); return; }
  const controls = env.controls(); savedControls = controls ? {controls, enabled: controls.enabled} : null;
  if (controls) controls.enabled = false;
  savedCursor = host.style.cursor || ''; host.style.cursor = 'crosshair'; active = true;
  status(`${floorName(context.floor)} · 按住左鍵拖出新房間範圍，放開建立；Esc 取消`); notify();
 }
 host.addEventListener('pointerdown', event => {
  if (!active || gesture || event.button !== 0 || event.target.closest?.('button,input,select,textarea,a')) return;
  stop(event); if (!validContext()) return;
  const point = world(event);
  if (!point) { status('這個視角無法對準樓板，請取消後調整視角再新增房間', true); return; }
  gesture = {pointerId: event.pointerId, start: point, clientX: event.clientX, clientY: event.clientY, room: null, moved: false};
  host.setPointerCapture(event.pointerId); updateDraft(event);
 }, true);
 host.addEventListener('pointermove', event => {
  if (!active || !gesture || gesture.pointerId !== event.pointerId) return;
  stop(event); if (validContext()) updateDraft(event);
 }, true);
 host.addEventListener('pointerup', event => {
  if (!active || !gesture || gesture.pointerId !== event.pointerId) return;
  stop(event); if (!validContext()) return;
  updateDraft(event);
  const {room, reason, moved} = gesture;
  if (!room || reason || !moved) { releasePointer(); status(reason || '請按住左鍵拖出至少 3 × 3 的房間範圍', true); notify(); return; }
  // Exit first: the creation callback may rebuild the entire model or navigate.
  finish();
  try {
   const id = env.createRoom(room);
   if (id) status(`已建立 ${id} · ${floorName(room.floor)} · ${room.w} × ${room.d}`);
  } catch (error) { status(`新增房間失敗：${error.message}`, true); }
 }, true);
 for (const type of ['pointercancel', 'lostpointercapture']) host.addEventListener(type, event => {
  if (gesture?.pointerId !== event.pointerId) return;
  if (type === 'pointercancel') stop(event);
  cancel();
 }, true);
 window.addEventListener('keydown', event => { if (active && event.key === 'Escape') { stop(event); cancel(); } }, true);
 window.addEventListener('blur', () => cancel());
 return {start, cancel, update() { if (active) validContext(); }, get active() { return active; }, get dragging() { return Boolean(gesture); }};
}
