import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './error-page.component.html',
  styleUrls: ['./error-page.component.css'],
  encapsulation: ViewEncapsulation.None 
})
export class ErrorPageComponent implements OnInit {
  errorCode: number = 404;
  errorTitle: string = 'Страницата не е намерена';
  errorDesc: string = 'Изглежда, че сте поели по грешен маршрут. Този контейнер с данни е празен.';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    // Абонираме се за данните от рутера
    this.route.data.subscribe(data => {
      if (data['type'] === 403 || data['type'] === '403') {
        this.errorCode = 403;
        this.errorTitle = 'Достъпът е ограничен';
        this.errorDesc = 'Нямате необходимите разрешения за този сектор. Системата за сигурност ви спря.';
      }
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }
}