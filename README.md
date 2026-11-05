# \# SolarIQ+ – AI-Powered Solar Planning \& Maintenance Assistant

# 

# <p align="center">

# &#x20; <strong>An Intelligent Platform for Rooftop Solar Planning, Generation Estimation and Maintenance Assistance</strong>

# </p>

# 

# \## 🌞 About the Project

# 

# \*\*SolarIQ+\*\* is an AI-powered solar planning and maintenance assistance platform designed to simplify rooftop solar adoption. It helps homeowners and businesses make informed decisions about solar installations through electricity bill analysis, rooftop assessment, solar system recommendations, energy generation estimation, financial analysis, and AI-powered maintenance assistance.

# 

# The platform integrates Artificial Intelligence, Machine Learning, Computer Vision, Optical Character Recognition (OCR), and conversational AI to provide an integrated solar planning and post-installation support experience.

# 

# \## 🎯 Project Objectives

# 

# \- Simplify rooftop solar planning and system selection.

# \- Automate electricity bill analysis using OCR.

# \- Assess rooftop suitability using image-based and satellite-based analysis.

# \- Recommend appropriate solar system configurations.

# \- Estimate solar energy generation and financial benefits.

# \- Provide AI-powered assistance for solar installation and maintenance.

# \- Enable users to submit and track solar maintenance service requests.

# 

# \## ✨ Key Features

# 

# \### 1. Electricity Bill Analysis Using OCR

# \- Upload electricity bill images.

# \- Process uploaded bills using OpenCV and Tesseract OCR.

# \- Extract relevant electricity consumption information.

# \- Use consumption data to support solar system recommendations.

# 

# \### 2. AI-Based Rooftop Assessment

# \- Analyze rooftop imagery to identify relevant rooftop characteristics.

# \- Integrate satellite imagery through Esri World Imagery.

# \- Use YOLO-World for open-vocabulary object detection.

# \- Identify potential rooftop obstacles such as buildings and trees.

# \- Support rooftop suitability and shadow-related analysis.

# 

# \### 3. Solar System Recommendation

# \- Recommend suitable solar system capacity.

# \- Suggest solar panel configurations.

# \- Support monofacial and bifacial panel recommendations.

# \- Provide relevant solar panel and brand suggestions.

# 

# \### 4. Solar Generation Prediction

# \- Estimate annual solar energy generation.

# \- Integrate an XGBoost-based Machine Learning model.

# \- Combine ML predictions with engineering-based calculations.

# \- Use a hybrid estimation approach with 70% ML contribution and 30% engineering calculation contribution.

# 

# \### 5. Solar Financial Analysis

# \- Estimate solar installation costs.

# \- Calculate potential electricity bill savings.

# \- Estimate return on investment (ROI).

# \- Calculate the approximate payback period.

# \- Present long-term financial projections.

# 

# \### 6. Solar Generation Simulator

# \- Allow users to provide custom simulation inputs.

# \- Estimate energy generation for different system configurations.

# \- Compare solar system configurations.

# \- Display estimated generation, costs, savings and ROI.

# 

# \### 7. AI Assistant – Installation \& Maintenance Chatbot

# \- Conversational solar assistance powered by Google Gemini API.

# \- Answer solar-related questions.

# \- Provide installation and setup guidance.

# \- Assist with common solar troubleshooting queries.

# \- Offer solar panel cleaning and maintenance recommendations.

# \- Provide contextual guidance for post-installation support.

# 

# \### 8. Solar Service Management

# \- Allow users to submit maintenance service requests.

# \- Support services such as solar panel cleaning and maintenance.

# \- Manage submitted requests through the Developer Portal.

# \- Enable developer-side request review and approval.

# \- Send approval email notifications to registered clients.

# \- Allow users to view and track their service requests.

# 

# \### 9. User Dashboard

# \- Centralized access to solar planning features.

# \- View solar analysis and recommendation results.

# \- Access simulator and AI assistant modules.

# \- Manage service requests and related information.

# 

# \## 🧠 Machine Learning \& AI Components

# 

# | Component | Technology | Purpose |

# |---|---|---|

# | Electricity Bill Analysis | Tesseract OCR, OpenCV | Extract electricity consumption information |

# | Rooftop Object Detection | YOLO-World | Identify relevant rooftop objects |

# | Solar Generation Prediction | XGBoost | Predict solar energy generation |

# | Conversational Assistance | Google Gemini API | Provide solar-related guidance |

# | Satellite Imagery | Esri World Imagery | Access satellite imagery for rooftop analysis |

# 

# \### XGBoost Model

# 

# The solar generation prediction module uses an XGBoost regression model trained using PVGIS-based solar and weather information.

# 

# The model incorporates features such as:

# \- Latitude and longitude

# \- Panel tilt angle

# \- Hour and day of the year

# \- Month

# \- Direct, diffuse and reflected irradiation

# \- Sun elevation

# \- Temperature

# \- Wind speed

# 

# The model is integrated with engineering-based calculations to produce a combined generation estimate.

# 

# \## 🛠️ Technology Stack

# 

# \### Frontend

# \- React.js

# \- JavaScript

# \- HTML5

# \- CSS3

# 

# \### Backend

# \- Python

# \- FastAPI

# \- REST APIs

# 

# \### Database \& Authentication

# \- MongoDB

# \- MongoDB Atlas

# \- Firebase Authentication / Google Authentication

# 

# \### Artificial Intelligence \& Machine Learning

# \- XGBoost

# \- YOLO-World

# \- Google Gemini API

# \- Tesseract OCR

# \- OpenCV

# 

# \### External Integrations

# \- Esri World Imagery

# \- PVGIS solar data

# \- Email notification integration

# 

# \### Development Tools

# \- Visual Studio Code

# \- Git

# \- GitHub

# \- Python Virtual Environment

# 

# \## 🏗️ System Architecture

# 

# SolarIQ+ follows a frontend-backend architecture.

# 

# 1\. \*\*Frontend Layer:\*\* React.js provides the user interface and interactive modules.

# 2\. \*\*Backend Layer:\*\* FastAPI manages business logic, API requests and AI/ML integrations.

# 3\. \*\*Database Layer:\*\* MongoDB stores application data and related records.

# 4\. \*\*AI/ML Layer:\*\* OCR, YOLO-World, XGBoost and Gemini power intelligent analysis and assistance.

# 5\. \*\*External Services Layer:\*\* Esri World Imagery and other integrations provide additional functionality.

# 

# \## 📁 Project Structure

# 

# ```text

# SolarIQPlus/

# │

# ├── backend/

# │   ├── API routes and backend services

# │   ├── AI and ML modules

# │   ├── OCR processing

# │   ├── YOLO-based detection

# │   ├── Solar generation prediction

# │   ├── Database integration

# │   └── Authentication and service management

# │

# ├── frontend/

# │   ├── public/

# │   ├── src/

# │   │   ├── components/

# │   │   ├── pages/

# │   │   ├── services/

# │   │   └── application files

# │   └── package.json

# │

# ├── tests/

# │

# ├── .gitignore

# ├── README.md

# ├── design\_guidelines.json

# └── test\_result.md

# ```

# 

# \*Note: The structure above is a high-level representation. Refer to the actual repository for the complete implementation and module arrangement.\*

# 

# \## ⚙️ Installation \& Setup

# 

# \### Prerequisites

# 

# Install the following before running the application:

# 

# \- Python

# \- Node.js and npm

# \- MongoDB Atlas account or configured MongoDB instance

# \- Git

# \- Tesseract OCR

# \- Required API credentials

# 

# \### 1. Clone the Repository

# 

# ```bash

# git clone https://github.com/rushikulkarni-design/SolarIQPlus.git

# cd SolarIQPlus

# ```

# 

# \### 2. Backend Setup

# 

# Navigate to the backend directory:

# 

# ```bash

# cd backend

# ```

# 

# Create a Python virtual environment:

# 

# ```bash

# python -m venv .venv

# ```

# 

# Activate the environment on Windows:

# 

# ```bash

# .venv\\Scripts\\activate

# ```

# 

# Install the backend dependencies using the project's dependency file:

# 

# ```bash

# pip install -r requirements.txt

# ```

# 

# Configure the required environment variables and API credentials in the appropriate local environment file.

# 

# Start the FastAPI application using the project's configured entry point and port.

# 

# \### 3. Frontend Setup

# 

# Open another terminal and navigate to the frontend directory:

# 

# ```bash

# cd frontend

# ```

# 

# Install the dependencies:

# 

# ```bash

# npm install

# ```

# 

# Configure the frontend environment variables as required.

# 

# Start the React development server using:

# 

# ```bash

# npm start

# ```

# 

# \*Note: Use the actual backend entry point, frontend scripts and environment variable names defined in the project configuration.\*

# 

# \## 🔐 Environment Configuration

# 

# The application requires appropriate configuration for services such as:

# 

# \- MongoDB connection

# \- Google Gemini API

# \- Firebase / Google Authentication

# \- Esri imagery integration

# \- Email notification service

# 

# \*\*Important:\*\* Never upload `.env` files, API keys, database passwords, authentication secrets or private credentials to GitHub.

# 

# \## 🔄 Application Workflow

# 

# 1\. User registers or logs into SolarIQ+.

# 2\. User uploads an electricity bill for OCR-based consumption analysis.

# 3\. The platform processes the available information.

# 4\. Rooftop assessment and solar system recommendations are generated.

# 5\. Estimated solar generation and financial benefits are presented.

# 6\. Users can explore the Solar Simulator.

# 7\. Users can interact with the AI Assistant for installation and maintenance guidance.

# 8\. Users can submit service requests through the platform.

# 9\. Developers review and manage submitted service requests through the Developer Portal.

# 10\. Approved requests trigger email notifications to clients.

# 

# \## 🌱 Project Impact

# 

# SolarIQ+ aims to make rooftop solar planning more accessible by combining intelligent analysis, predictive estimation and post-installation assistance in a unified platform.

# 

# It supports informed solar adoption, improves access to maintenance guidance and encourages the use of renewable energy.

# 

# \## 🔮 Future Enhancements

# 

# \- Fine-tuned satellite imagery models using dedicated labelled rooftop datasets.

# \- More advanced rooftop segmentation and shadow analysis.

# \- Integration with live solar monitoring systems.

# \- Enhanced solar generation forecasting.

# \- Additional solar service providers and service categories.

# \- Mobile application integration.

# \- Advanced maintenance analytics and automated notifications.

# 

# \## 👨‍💻 Project Information

# 

# \*\*Project Name:\*\* SolarIQ+

# 

# \*\*Project Title:\*\* AI-Powered Solar Planning \& Maintenance Assistant

# 

# \*\*Domain:\*\* Artificial Intelligence, Machine Learning and Renewable Energy

# 

# \*\*Project Type:\*\* Major Academic Project

# 

# \*\*Repository:\*\* \[SolarIQPlus – GitHub](https://github.com/rushikulkarni-design/SolarIQPlus)

# 

# \## 📜 Disclaimer

# 

# Solar generation, savings, installation costs and payback estimates provided by SolarIQ+ are indicative and depend on system configuration, location, weather conditions, electricity tariffs and other external factors. Actual results may vary.

# 

# \---

# 

# <p align="center">

# &#x20; <strong>SolarIQ+ – Making Solar Planning Smarter with AI 🌞</strong>

# </p>

