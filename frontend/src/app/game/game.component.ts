import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { GameService } from './game.service';
import { AppInsightsService } from '../services/app-insights.service';

interface MovingPlatform {
  mesh: THREE.Mesh;
  startPos: THREE.Vector2;
  endPos: THREE.Vector2;
  speed: number;
  progress: number;
  direction: 1 | -1;
}

interface BouncePlatform {
  mesh: THREE.Mesh;
  bounceForce: number;
}

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.sass'],
  imports: [CommonModule, FormsModule],
  standalone: true
})
export class GameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvasContainer') gameContainer!: ElementRef;
  @ViewChild('nameInput') nameInput!: ElementRef;
  
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private player!: THREE.Mesh;
  private ground!: THREE.Mesh;
  private platforms: THREE.Mesh[] = [];
  private movingPlatforms: MovingPlatform[] = [];
  private bouncePlatforms: BouncePlatform[] = [];
  private goal!: THREE.Mesh;
  private startPlatform!: THREE.Mesh;
  
  private playerVelocity = new THREE.Vector2();
  private isJumping = false;
  gameStarted = false;  // Changed to public
  gameTime = 0;
  gameTimeMs = 0;
  private startTime = 0;
  private animationId: number | null = null;
  private leaderboardInterval: number | undefined;

  // Game dimensions
  private readonly WORLD_WIDTH = 40;  
  private readonly WORLD_HEIGHT = 15;
  private readonly PLAYER_START_X = -16;  
  private readonly PLAYER_START_Y = 2;  // Moved down
  private readonly GOAL_X = 16;  
  private readonly GOAL_Y = 2;  // Moved down

  // Platform settings
  private readonly PLATFORM_SPEED = 0.02;
  private readonly VERTICAL_MOVE_DISTANCE = 3;
  private readonly HORIZONTAL_MOVE_DISTANCE = 4;
  private readonly BOUNCE_FORCE = 0.6;

  gameCompleted = false;
  timeoutOccurred = false;
  playerName = '';
  scoreSubmitted = false;
  isSubmittingScore = false;  // Add this line
  leaderboardScores: Array<{playerName: string, time: number}> = [];
  errorMessage = '';

  constructor(
    private gameService: GameService,
    private appInsights: AppInsightsService
  ) {
    this.loadLeaderboard();
    this.startLeaderboardRefresh();
    // Load saved player name from localStorage
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      this.playerName = savedName;
    }
  }

  private startLeaderboardRefresh() {
    const REFRESH_INTERVAL_MS = 10000; // 10 seconds
    this.leaderboardInterval = window.setInterval(() => {
      this.loadLeaderboard();
    }, REFRESH_INTERVAL_MS);
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
    if (this.leaderboardInterval) {
      clearInterval(this.leaderboardInterval);
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
    // Load the Azure logo texture
    const textureLoader = new THREE.TextureLoader();
    const material = new THREE.MeshBasicMaterial({
      map: textureLoader.load('assets/azure.svg'),
      transparent: true,
      side: THREE.DoubleSide
    });
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
    
    // Start platform
    const startGeometry = new THREE.PlaneGeometry(4, 0.5);
    const startMaterial = new THREE.MeshLambertMaterial({ color: 0x4CAF50, side: THREE.DoubleSide });
    this.startPlatform = new THREE.Mesh(startGeometry, startMaterial);
    this.startPlatform.position.set(this.PLAYER_START_X, this.PLAYER_START_Y - 1, 0);
    this.scene.add(this.startPlatform);
    
    // Create static platforms with random variations
    const basePositions = [
      { x: -12, y: 3 },
      { x: -4, y: 3 },
      { x: 4, y: 3 },
      { x: 12, y: 3 }
    ];

    for (const pos of basePositions) {
      const platform = new THREE.Mesh(platformGeometry, platformMaterial);
      // Add some randomness to platform positions
      const randomX = pos.x + (Math.random() * 2 - 1);
      const randomY = pos.y + (Math.random() * 1.5 - 0.75);
      platform.position.set(randomX, randomY, 0);
      this.platforms.push(platform);
      this.scene.add(platform);
    }

    // Add bounce platforms (blue) lower
    const bouncePlatformGeometry = new THREE.PlaneGeometry(2, 0.5);
    const bouncePlatformMaterial = new THREE.MeshLambertMaterial({ color: 0x2196F3, side: THREE.DoubleSide });
    
    const bouncePositions = [
      { x: -6, y: 5 },   // Lowered
      { x: 6, y: 5.5 }   // Lowered
    ];

    for (const pos of bouncePositions) {
      const platform = new THREE.Mesh(bouncePlatformGeometry, bouncePlatformMaterial);
      platform.position.set(pos.x, pos.y, 0);
      this.bouncePlatforms.push({
        mesh: platform,
        bounceForce: this.BOUNCE_FORCE
      });
      this.scene.add(platform);
    }

    // Add moving platforms
    const movingPlatformMaterial = new THREE.MeshLambertMaterial({ color: 0xe91e63, side: THREE.DoubleSide });

    // Horizontal moving platforms (red bars)
    const horizontalMovers = [
      { centerX: -8, y: 2 },
      { centerX: 8, y: 2 }
    ];

    for (const pos of horizontalMovers) {
      const platform = new THREE.Mesh(platformGeometry, movingPlatformMaterial);
      platform.position.set(pos.centerX, pos.y, 0);
      platform.rotation.z = Math.PI / 2; // Rotate 90 degrees around Z axis
      
      this.movingPlatforms.push({
        mesh: platform,
        startPos: new THREE.Vector2(pos.centerX - this.HORIZONTAL_MOVE_DISTANCE, pos.y),
        endPos: new THREE.Vector2(pos.centerX + this.HORIZONTAL_MOVE_DISTANCE, pos.y),
        speed: this.PLATFORM_SPEED,
        progress: Math.random(),
        direction: Math.random() < 0.5 ? 1 : -1
      });
      
      this.scene.add(platform);
    }

    // Vertical moving platforms
    const verticalMovers = [
      { x: 0, centerY: 2 }
    ];

    for (const pos of verticalMovers) {
      const platform = new THREE.Mesh(platformGeometry, movingPlatformMaterial);
      platform.position.set(pos.x, pos.centerY, 0);
      
      this.movingPlatforms.push({
        mesh: platform,
        startPos: new THREE.Vector2(pos.x, pos.centerY - this.VERTICAL_MOVE_DISTANCE),
        endPos: new THREE.Vector2(pos.x, pos.centerY + this.VERTICAL_MOVE_DISTANCE),
        speed: this.PLATFORM_SPEED,
        progress: 0,
        direction: 1
      });
      
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

  private updateMovingPlatforms() {
    for (const platform of this.movingPlatforms) {
      // Store old position for collision check
      const oldX = platform.mesh.position.x;
      const oldY = platform.mesh.position.y;
      
      // Update progress
      platform.progress += platform.speed * platform.direction;
      
      // Check bounds and reverse direction if needed
      if (platform.progress >= 1) {
        platform.progress = 1;
        platform.direction = -1;
      } else if (platform.progress <= 0) {
        platform.progress = 0;
        platform.direction = 1;
      }

      // Calculate new position
      const newX = platform.startPos.x + (platform.endPos.x - platform.startPos.x) * platform.progress;
      const newY = platform.startPos.y + (platform.endPos.y - platform.startPos.y) * platform.progress;
      
      // If this is a horizontal platform (red bar), we need to check collisions differently
      if (platform.mesh.rotation.z === Math.PI / 2) {
        platform.mesh.position.set(newX, newY, 0);
        continue; // Skip collision check for horizontal bars
      }

      // Only check collisions for vertical moving platforms
      platform.mesh.position.set(newX, newY, 0);
      let collision = false;
      
      for (const staticPlatform of this.platforms) {
        if (this.checkCollision(platform.mesh, staticPlatform)) {
          collision = true;
          break;
        }
      }

      // If there's a collision, revert to old position and reverse direction
      if (collision) {
        platform.mesh.position.set(oldX, oldY, 0);
        platform.direction *= -1;
        platform.progress = platform.direction === 1 ? 0 : 1;
      }
    }
  }

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    // Update player position
    this.player.position.x += this.playerVelocity.x;
    this.player.position.y += this.playerVelocity.y;
    
    // Apply gravity
    this.playerVelocity.y -= 0.015;
    
    // Update moving platforms
    this.updateMovingPlatforms();
    
    // Check ground collision for respawn and penalty
    const playerBottom = this.player.position.y - 0.5;
    if (playerBottom < -1) {
      this.respawnPlayer();
      if (this.gameStarted && !this.gameCompleted) {
        // Add 1 second penalty for touching the ground
        this.startTime -= 5000;
        this.appInsights.trackEvent('GroundTouchPenalty', { time: this.gameTime + (this.gameTimeMs / 1000) });
      }
    }

    // Check for timeout
    if (this.gameStarted && !this.gameCompleted && this.gameTime >= 30) {
      this.timeoutOccurred = true;
      this.appInsights.trackEvent('GameTimeout', { time: this.gameTime + (this.gameTimeMs / 1000) });
      this.completeGame();
    }

    // Check platform collisions
    let onPlatform = false;
    const allPlatforms = [
      ...this.platforms, 
      this.startPlatform, 
      this.goal,
      ...this.movingPlatforms.map(p => p.mesh)
    ];
    
    // First check bounce platforms
    for (const bouncePlatform of this.bouncePlatforms) {
      if (this.checkCollision(this.player, bouncePlatform.mesh)) {
        // Bounce the player up with the bounce force
        this.playerVelocity.y = bouncePlatform.bounceForce;
        this.isJumping = true;
      }
    }

    // Then check regular platforms
    for (const platform of allPlatforms) {
      if (this.checkCollision(this.player, platform)) {
        // Get the moving platform if this is one
        const movingPlatform = this.movingPlatforms.find(p => p.mesh === platform);
        
        if (movingPlatform) {
          // For vertical moving platforms
          if (this.playerVelocity.y < 0) {
            this.player.position.y = platform.position.y + 0.75;
            this.playerVelocity.y = 0;
            this.isJumping = false;
            onPlatform = true;
          }
          
          // For horizontal moving platforms (red bars)
          const moveDir = platform.rotation.z === Math.PI / 2 ? 'horizontal' : 'vertical';
          if (moveDir === 'horizontal') {
            // Push the player horizontally
            const platformDeltaX = (movingPlatform.endPos.x - movingPlatform.startPos.x) * 
                                movingPlatform.speed * movingPlatform.direction;
            this.player.position.x += platformDeltaX;
            
            // If hitting from the side, push away
            const playerCenter = this.player.position.x;
            const platformCenter = platform.position.x;
            if (Math.abs(playerCenter - platformCenter) > 0.4) {
              this.playerVelocity.x = playerCenter < platformCenter ? -0.3 : 0.3;
            }
          }
        } else {
          // Regular platform collision
          if (this.playerVelocity.y < 0) {
            this.player.position.y = platform.position.y + 0.75;
            this.playerVelocity.y = 0;
            this.isJumping = false;
            onPlatform = true;
          }
        }
      }
    }

    // Check goal collision
    if (this.checkCollision(this.player, this.goal)) {
      this.completeGame();
    }

    // Update game time
    if (this.gameStarted && !this.gameCompleted) {
      const currentTime = Date.now() - this.startTime;
      this.gameTime = Math.floor(currentTime / 1000);
      this.gameTimeMs = currentTime % 1000;
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
      // Disable controls
      this.gameStarted = false;
      
      // Focus the name input after a short delay to ensure the UI is ready
      setTimeout(() => {
        if (this.nameInput) {
          this.nameInput.nativeElement.focus();
        }
      }, 100);
    }
  }

  restartGame() {
    this.gameCompleted = false;
    this.scoreSubmitted = false;
    this.playerName = '';
    this.errorMessage = '';
    this.gameTime = 0;
    this.gameTimeMs = 0;
    this.gameStarted = false;
    this.startTime = Date.now();
    this.timeoutOccurred = false;
    this.respawnPlayer();
  }

  onNameChange(newName: string) {
    localStorage.setItem('playerName', newName);
  }

  submitScore() {
    if (this.playerName && this.gameCompleted && !this.scoreSubmitted) {
      this.errorMessage = ''; // Clear any previous error
      this.isSubmittingScore = true; // Set loading state
      const score = {
        playerName: this.playerName,
        time: this.gameTime + (this.gameTimeMs / 1000),
        created: new Date()
      };
      
      this.gameService.submitScore(score).subscribe({
        next: () => {
          this.loadLeaderboard();
          this.errorMessage = ''; // Clear error on success
          this.scoreSubmitted = true; // Set flag after successful submission
          this.isSubmittingScore = false; // Clear loading state
        },
        error: (error) => {
          console.error('Failed to submit score:', error);
          if (error.status === 400) {
            this.errorMessage = 'Username contains inappropriate content or email. Please choose a different name.';
          } else {
            this.errorMessage = 'Failed to submit score. Please try again.';
          }
          this.isSubmittingScore = false; // Clear loading state on error
        }
      });
    }
  }

  private loadLeaderboard() {
    this.gameService.getTopScores().subscribe({
      next: (scores) => {
        this.leaderboardScores = scores;
      },
      error: (error) => {
        console.error('Failed to load leaderboard:', error);
        this.leaderboardScores = []; // Reset to empty array on error
      }
    });
  }
}
