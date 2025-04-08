import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { GameService } from './game.service';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.sass'],
  imports: [CommonModule, FormsModule],
  standalone: true
})
export class GameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvasContainer') gameContainer!: ElementRef;
  
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private player!: THREE.Mesh;
  private ground!: THREE.Mesh;
  private platforms: THREE.Mesh[] = [];
  private goal!: THREE.Mesh;
  private startPlatform!: THREE.Mesh;
  
  private playerVelocity = new THREE.Vector2();
  private isJumping = false;
  private gameStarted = false;
  gameTime = 0;
  private startTime = 0;
  private animationId: number | null = null;

  // Game dimensions
  private readonly WORLD_WIDTH = 40;  
  private readonly WORLD_HEIGHT = 15;  // Reduced height for better visibility
  private readonly PLAYER_START_X = -16;  
  private readonly PLAYER_START_Y = 4;  // Increased height for starting platform
  private readonly GOAL_X = 16;  
  private readonly GOAL_Y = 4;

  gameCompleted = false;
  playerName = '';
  leaderboardScores: Array<{playerName: string, time: number}> = [];

  constructor(private gameService: GameService) {
    this.loadLeaderboard();
  }

  ngAfterViewInit() {
    this.initScene();
    this.initPlayer();
    this.initLevel();
    this.setupControls();
    this.animate();
  }

  ngOnDestroy() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.renderer.dispose();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    
    // Set camera to exactly fit the world width
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -this.WORLD_WIDTH/2,  // Left
      this.WORLD_WIDTH/2,   // Right
      (this.WORLD_WIDTH/aspect)/2,  // Top
      -(this.WORLD_WIDTH/aspect)/2, // Bottom
      0.1,
      1000
    );
    
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.gameContainer.nativeElement.appendChild(this.renderer.domElement);
    
    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 1);
    this.scene.add(directionalLight);

    // Position camera
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
  }

  private initPlayer() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    this.player = new THREE.Mesh(geometry, material);
    this.respawnPlayer();
    this.scene.add(this.player);

    // Add ground (slightly lower and red)
    const groundGeometry = new THREE.PlaneGeometry(this.WORLD_WIDTH, 1);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.position.y = -2;
    this.scene.add(this.ground);
  }

  private initLevel() {
    const platformGeometry = new THREE.PlaneGeometry(3, 0.5);
    const platformMaterial = new THREE.MeshLambertMaterial({ color: 0x808080, side: THREE.DoubleSide });
    
    // Start platform (wider for better landing)
    const startGeometry = new THREE.PlaneGeometry(4, 0.5);
    const startMaterial = new THREE.MeshLambertMaterial({ color: 0x4CAF50, side: THREE.DoubleSide });
    this.startPlatform = new THREE.Mesh(startGeometry, startMaterial);
    this.startPlatform.position.set(this.PLAYER_START_X, this.PLAYER_START_Y - 1, 0);
    this.scene.add(this.startPlatform);
    
    // Create platforms with more controlled placement for a clear path
    const platformPositions = [
      { x: -12, y: 5 },
      { x: -8, y: 4 },
      { x: -4, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 5 },
      { x: 8, y: 4 },
      { x: 12, y: 5 }
    ];

    for (const pos of platformPositions) {
      const platform = new THREE.Mesh(platformGeometry, platformMaterial);
      platform.position.set(pos.x, pos.y, 0);
      this.platforms.push(platform);
      this.scene.add(platform);
    }

    // Goal platform (golden and wider)
    const goalGeometry = new THREE.PlaneGeometry(4, 0.5);
    const goalMaterial = new THREE.MeshLambertMaterial({ color: 0xffd700, side: THREE.DoubleSide });
    this.goal = new THREE.Mesh(goalGeometry, goalMaterial);
    this.goal.position.set(this.GOAL_X, this.GOAL_Y, 0);
    this.scene.add(this.goal);
  }

  private respawnPlayer() {
    this.player.position.set(this.PLAYER_START_X, this.PLAYER_START_Y, 0);
    this.playerVelocity.set(0, 0);
    this.isJumping = false;
  }

  private setupControls() {
    document.addEventListener('keydown', (event) => {
      if (!this.gameStarted) {
        this.gameStarted = true;
        this.startTime = Date.now();
      }

      switch (event.code) {
        case 'ArrowLeft':
          this.playerVelocity.x = -0.2;
          break;
        case 'ArrowRight':
          this.playerVelocity.x = 0.2;
          break;
        case 'Space':
          if (!this.isJumping) {
            this.playerVelocity.y = 0.3;
            this.isJumping = true;
          }
          break;
      }
    });

    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'ArrowRight':
          this.playerVelocity.x = 0;
          break;
      }
    });
  }

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    // Update player position
    this.player.position.x += this.playerVelocity.x;
    this.player.position.y += this.playerVelocity.y;
    
    // Apply gravity
    this.playerVelocity.y -= 0.015; // Slightly increased gravity
    
    // Check ground collision for respawn
    const playerBottom = this.player.position.y - 0.5;
    if (playerBottom < -1) { // Ground is at -2, so check slightly above
      this.respawnPlayer();
    }

    // Check platform collisions including start platform
    let onPlatform = false;
    const platforms = [...this.platforms, this.startPlatform, this.goal];
    
    for (const platform of platforms) {
      if (this.checkCollision(this.player, platform)) {
        if (this.playerVelocity.y < 0) {
          this.player.position.y = platform.position.y + 0.75;
          this.playerVelocity.y = 0;
          this.isJumping = false;
          onPlatform = true;
        }
      }
    }

    // Check goal collision
    if (this.checkCollision(this.player, this.goal)) {
      this.completeGame();
    }

    // Update game time
    if (this.gameStarted && !this.gameCompleted) {
      this.gameTime = Math.floor((Date.now() - this.startTime) / 1000);
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  private checkCollision(obj1: THREE.Mesh, obj2: THREE.Mesh): boolean {
    // Store dimensions during object creation
    const width1 = (obj1.geometry as THREE.PlaneGeometry).parameters.width;
    const height1 = (obj1.geometry as THREE.PlaneGeometry).parameters.height;
    const width2 = (obj2.geometry as THREE.PlaneGeometry).parameters.width;
    const height2 = (obj2.geometry as THREE.PlaneGeometry).parameters.height;
    
    const box1 = new THREE.Box2(
      new THREE.Vector2(obj1.position.x - width1/2, obj1.position.y - height1/2),
      new THREE.Vector2(obj1.position.x + width1/2, obj1.position.y + height1/2)
    );
    const box2 = new THREE.Box2(
      new THREE.Vector2(obj2.position.x - width2/2, obj2.position.y - height2/2),
      new THREE.Vector2(obj2.position.x + width2/2, obj2.position.y + height2/2)
    );
    return box1.intersectsBox(box2);
  }

  private completeGame() {
    if (!this.gameCompleted) {
      this.gameCompleted = true;
      // Stop player movement
      this.playerVelocity.x = 0;
      this.playerVelocity.y = 0;
    }
  }

  submitScore() {
    if (this.playerName && this.gameCompleted) {
      this.gameService.submitScore({
        playerName: this.playerName,
        time: this.gameTime
      }).subscribe(() => {
        this.loadLeaderboard();
      });
    }
  }

  private loadLeaderboard() {
    this.gameService.getLeaderboard().subscribe(scores => {
      this.leaderboardScores = scores;
    });
  }
}
