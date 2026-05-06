import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-technology',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './technology.html',
  styleUrls: ['./technology.css'],
})
export class TechnologyComponent {}
