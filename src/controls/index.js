import keyboardJS from 'keyboardjs'
import nipplejs from 'nipplejs'
import lock from 'pointer-lock'
import {mobileAndTabletcheck} from '../utils/isMobile'
import FlyControls from '../modules/FlyControls'
// import {OrbitControls} from '../modules/OrbitControls'
import {triggerExplosion} from '../particles'
import PubSub from '../events'
import {scene, camera, renderer} from '../index'
import {
  Mesh,
  SphereBufferGeometry,
  MeshPhongMaterial,
  Vector3
} from 'three'
import {selectNearestTargetInSight, hudElement} from '../hud'

let controlsModule
let controlsElement
let isMobile = mobileAndTabletcheck()
let controlsInitialized = false
const initControls = (msg, data) => {
  if (controlsInitialized) return
  if (isMobile) {
    document.getElementById('touchPane').style.display = 'block'
    const touchPaneLeft = window.document.getElementsByClassName('touchPaneLeft')[0]
    const nippleLook = nipplejs.create({
      zone: touchPaneLeft,
      mode: 'static',
      position: {left: '30%', top: '90%'},
      color: 'white'
    })

    // display touch buttons
    Array.from(document.getElementsByClassName('touchButton')).forEach(el => {
      el.style.display = 'block'
    })
    // hide verbose text
    document.getElementById('verbosePane').style.display = 'none'
    // get button X
    const buttonX = document.getElementById('buttonX')
    const pressX = (event) => {
      event.target.style.opacity = 0.5
      fireBullet({button: 2})
      setTimeout(() => { event.target.style.opacity = 0.3 }, 250)
    }
    buttonX.addEventListener('click', pressX, false)
    buttonX.addEventListener('touchstart', pressX, false)

    controlsModule = new FlyControls(camera, touchPaneLeft, nippleLook)
    controlsElement = touchPaneLeft
  } else {
    const pointer = lock(renderer.domElement)
    controlsModule = new FlyControls(camera, renderer.domElement, undefined, pointer)
    controlsElement = renderer.domElement
  }

  controlsModule.update(0)
  PubSub.publish('x.loops.unshift', (timestamp, delta) => controlsModule.update(delta))

  const pilotDrone = data.pilotDrone

  // keyboardJS.bind('p', e => {
  //   if (isMobile) { return }
  //   const NewControlsClass = controlsModule.constructor.name === 'OrbitControls' ? FlyControls : OrbitControls
  //   console.log('controlsClass', NewControlsClass)
  //   controlsModule.dispose()
  //   const newModule = new NewControlsClass(camera, controlsElement)
  //   window.controls = newModule
  //   controlsModule = newModule
  //   controlsModule.update(0)

  //   if (NewControlsClass === OrbitControls) {
  //     let cam = pilotDrone.position.clone()
  //     newModule.target.set(cam.x, cam.y, cam.z)
  //   }
  // })

  keyboardJS.bind('c', e => {
    console.log(camera.position)
  })

  keyboardJS.bind('r', e => {
    if (controlsModule.constructor.name === 'OrbitControls') {
      controlsModule.autoRotate = !controlsModule.autoRotate
    }
  })

  keyboardJS.bind('space', e => PubSub.publish('x.toggle.play'))

  const bullet = new Mesh(
    new SphereBufferGeometry(1, 5, 5),
    new MeshPhongMaterial({color: 0x111111})
  )
  const fireBullet = e => {
    if (!pilotDrone) return

    if (e.button === 0) { // left click
      PubSub.publish('x.drones.gun.start', pilotDrone)
      PubSub.publish('x.camera.shake.start', 5)
      pilotDrone.gunClock.start()
    } else if (e.button === 2) { // right click
      const target = selectNearestTargetInSight()
      if (target === null || target.destroyed) return

      const fire = bullet.clone()
      fire.position.copy(pilotDrone.position)
      scene.add(fire)
      PubSub.publish('x.drones.missile.start', fire)

      const BulletContructor = function () {
        this.alive = true
        this.object = fire
        this.loop = (timestamp, delta) => {
          if (!this.alive) return
          const vec = target.position.clone().sub(fire.position)
          if (vec.length() < 10) {
            this.alive = false
            triggerExplosion(target)
            PubSub.publish('x.drones.missile.stop', fire)
            PubSub.publish('x.drones.explosion', target)
            target.userData.life -= 25
            hudElement.forceUpdate()
          }
          const newDir = vec.normalize().multiplyScalar(10 * delta / 16.66)
          fire.position.add(newDir)
        }
      }

      const callback = new BulletContructor()
      PubSub.publish('x.loops.push', callback)
    }
  }
  renderer.domElement.addEventListener('mousedown', fireBullet, false)
  renderer.domElement.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      PubSub.publish('x.drones.gun.stop', pilotDrone)
      PubSub.publish('x.camera.shake.stop')
      pilotDrone.gunClock.stop()
    }
  }, false)
}
PubSub.subscribe('x.drones.pilotDrone.loaded', initControls)

let tmpVec = new Vector3()
PubSub.subscribe('x.drones.collision.terrain.pilotDrone', (msg, terrainNormal) => {
  controlsModule.acceleration = 0
  tmpVec.copy(controlsModule.velocity).applyQuaternion(camera.quaternion)
  tmpVec.reflect(terrainNormal)
  tmpVec.add(camera.position)
  controlsModule.velocity = camera.worldToLocal(tmpVec)
  setTimeout(() => { controlsModule.acceleration = 60 }, 1000)
})

export default controlsModule
